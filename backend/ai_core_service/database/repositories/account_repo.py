from database.connection import db_connection
from log.logger_config import logger
import pandas as pd

class AccountsRepository:
    def fetch_all(self):
        try:
            query = """
                SELECT account_code, category_code, parent_account_code, account_label, account_level
                FROM account
            """
            # Use the DatabaseConnection's execute_query method
            result_data = db_connection.execute_query(query)
            
            # Convert to DataFrame
            df = pd.DataFrame(result_data)
            logger.info(f"Fetched {len(df)} accounts")
            return df
        except Exception as e:
            logger.error(f"Error fetching accounts: {e}")
            return pd.DataFrame()

accounts_repo = AccountsRepository()