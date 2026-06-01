import re


def validate_accounts(data):
    """
    Keep only rows whose account_code is a real accounting code.

    C6: accepts an optional sub-account separator (".", "-", "/", space) so codes
    like "401.1" or "411-100" are not rejected, while still dropping text rows
    (titles, headers). The code must be numeric once separators are stripped, start
    with a digit, and be 2–12 digits long.
    """
    validated = []
    for row in data:
        code = row.get("account_code")
        if not code:
            continue
        code = str(code).strip()

        core = re.sub(r"[.\-/ ]", "", code)
        if not core.isdigit() or not (2 <= len(core) <= 12):
            continue

        row["account_code"] = code
        validated.append(row)
    return validated