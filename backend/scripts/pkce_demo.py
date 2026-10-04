"""A hands-on demonstration of PKCE, using the same pure functions the server uses.

    cd backend && uv run python -m scripts.pkce_demo

No network and no database: it only shows WHY a stolen sign-in code is useless.
"""
import secrets

from app.domain.pkce import challenge_for, verifier_matches


def main() -> None:
    print("=== 1. The app (your phone) prepares, BEFORE opening the browser ===")
    verifier = secrets.token_urlsafe(32)          # 43 random characters, kept secret inside the app
    challenge = challenge_for(verifier)           # a one-way fingerprint: safe to share
    print(f"secret verifier (stays in the app):  {verifier}")
    print(f"challenge sent to the server:        {challenge}")
    print("  -> the challenge is SHA-256(verifier). You cannot work back from it to the verifier.\n")

    print("=== 2. Google signs the user in; the server hands back a one-time code ===")
    print("  (the code travels in a link such as isabella://auth?code=..., which ANY app on the phone could grab)\n")

    print("=== 3. The server's check when someone tries to redeem the code ===")
    attempts = {
        "the real app, presenting its verifier": verifier,
        "a thief who stole the code, guessing": secrets.token_urlsafe(32),
        "a thief who only knows the challenge": challenge,
        "a thief sending an empty verifier": "",
    }
    for who, attempt in attempts.items():
        verdict = "ACCEPTED" if verifier_matches(attempt, challenge) else "refused"
        print(f"  {who:<42} -> {verdict}")

    print("\nTakeaway: holding the code is not enough. Only the party that knows the original")
    print("verifier (the app that started the login) can finish it.")


if __name__ == "__main__":
    main()
