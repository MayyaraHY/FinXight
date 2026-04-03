def validate_accounts(data):
    validated = []
    for row in data:
        account_code = row.get("account_code")
        if not account_code or not account_code.isdigit() or len(account_code) < 2 or len(account_code) > 10:
            continue
        validated.append(row)
    return validated