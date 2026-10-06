from datetime import datetime, timedelta, timezone

from app.domain.dashboard import PaidOrder, SoldLine, StockedProduct, sales_summary, stock_report

NOW = datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc)


def piece(name, sizes, active=True, pid=None):
    return StockedProduct(id=pid or name, name=name, is_active=active, sizes=sizes)


class TestStockReport:
    def test_counts_units_and_lists_low_sizes_lowest_first(self):
        report = stock_report([piece("Dress", {"S": 10, "M": 2, "L": 1}), piece("Top", {"M": 3})], low_threshold=3)
        assert report["units_in_stock"] == 16
        assert [(r["name"], r["size"], r["stock"]) for r in report["low_stock"]] == [
            ("Dress", "L", 1),
            ("Dress", "M", 2),
            ("Top", "M", 3),
        ]

    def test_threshold_is_inclusive_and_zero_is_not_low_but_sold_out(self):
        report = stock_report([piece("Dress", {"S": 0, "M": 4})], low_threshold=3)
        assert report["low_stock"] == []

    def test_a_piece_with_every_size_at_zero_is_sold_out(self):
        report = stock_report([piece("Dress", {"S": 0, "M": 0}), piece("Top", {"S": 0, "M": 1})], low_threshold=3)
        assert [p["name"] for p in report["sold_out"]] == ["Dress"]

    def test_hidden_pieces_are_ignored_by_the_alerts_but_their_units_still_count(self):
        report = stock_report([piece("Draft", {"S": 1}, active=False)], low_threshold=3)
        assert report["low_stock"] == [] and report["sold_out"] == []
        assert report["units_in_stock"] == 1

    def test_a_piece_with_no_sizes_is_not_reported_sold_out(self):
        assert stock_report([piece("Empty", {})], low_threshold=3)["sold_out"] == []

    def test_counts_pieces(self):
        report = stock_report([piece("A", {"S": 1}), piece("B", {"S": 1}, active=False)], low_threshold=3)
        assert report["pieces"] == 2 and report["visible_pieces"] == 1

    def test_does_not_change_its_input(self):
        sizes = {"M": 1}
        stock_report([piece("A", sizes)], low_threshold=3)
        assert sizes == {"M": 1}


def paid(hours_ago, total, lines):
    return PaidOrder(paid_at=NOW - timedelta(hours=hours_ago), total_kobo=total, lines=lines)


def line(name, qty, total, pid=None):
    return SoldLine(product_id=pid or name, name=name, quantity=qty, line_total_kobo=total)


class TestSalesSummary:
    def test_totals_orders_items_and_average(self):
        orders = [paid(1, 3000, [line("A", 2, 2000), line("B", 1, 1000)]), paid(2, 1000, [line("A", 1, 1000)])]
        s = sales_summary(orders, now=NOW, days=7)
        assert (s["revenue_kobo"], s["orders"], s["items_sold"], s["average_order_kobo"]) == (4000, 2, 4, 2000)

    def test_no_sales_gives_zeros_not_a_division_error(self):
        s = sales_summary([], now=NOW, days=7)
        assert (s["revenue_kobo"], s["orders"], s["average_order_kobo"]) == (0, 0, 0)
        assert s["top_products"] == []

    def test_every_day_of_the_window_appears_oldest_first_including_empty_days(self):
        s = sales_summary([paid(0, 500, [line("A", 1, 500)])], now=NOW, days=3, tz_offset_minutes=0)
        assert [d["date"] for d in s["by_day"]] == ["2026-10-08", "2026-10-09", "2026-10-10"]
        assert [d["revenue_kobo"] for d in s["by_day"]] == [0, 0, 500]

    def test_days_are_cut_in_the_shops_local_time(self):
        # 23:30 UTC on the 9th is already the 10th in Lagos (UTC+1).
        late = PaidOrder(paid_at=datetime(2026, 10, 9, 23, 30, tzinfo=timezone.utc), total_kobo=100, lines=[line("A", 1, 100)])
        s = sales_summary([late], now=NOW, days=2, tz_offset_minutes=60)
        assert {d["date"]: d["revenue_kobo"] for d in s["by_day"]} == {"2026-10-09": 0, "2026-10-10": 100}

    def test_orders_outside_the_window_are_ignored(self):
        old = paid(24 * 30, 999, [line("A", 1, 999)])
        assert sales_summary([old], now=NOW, days=7)["revenue_kobo"] == 0

    def test_top_products_by_revenue_then_name_limited_to_five(self):
        orders = [paid(1, 0, [line(n, 1, rev) for n, rev in zip("ABCDEFG", (10, 70, 30, 30, 20, 60, 5))])]
        top = sales_summary(orders, now=NOW, days=7)["top_products"]
        assert [t["name"] for t in top] == ["B", "F", "C", "D", "E"]

    def test_lines_of_the_same_product_are_combined(self):
        orders = [paid(1, 0, [line("A", 1, 100, pid="p1")]), paid(2, 0, [line("A", 2, 180, pid="p1")])]
        top = sales_summary(orders, now=NOW, days=7)["top_products"]
        assert top == [{"product_id": "p1", "name": "A", "units": 3, "revenue_kobo": 280}]
