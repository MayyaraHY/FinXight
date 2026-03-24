from database.connection import db_connection
from log.logger_config import logger
import pandas as pd

class CategoriesRepository:
    def fetch_all(self):
        try:
            query = "SELECT category_code, category_label, class_code FROM category"
            # Use the DatabaseConnection's execute_query method
            result_data = db_connection.execute_query(query)
            
            # Convert to DataFrame
            df = pd.DataFrame(result_data)
            logger.info(f"Fetched {len(df)} categories")
            return df
        except Exception as e:
            logger.error(f"Error fetching categories: {e}")
            return pd.DataFrame()

categories_repo = CategoriesRepository()