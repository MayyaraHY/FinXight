from database.connection import db_connection
from log.logger_config import logger
import pandas as pd

class ClassesRepository:
    def fetch_all(self):
        try:
            query = "SELECT class_code, class_label FROM classe"
            # Use the DatabaseConnection's execute_query method
            result_data = db_connection.execute_query(query)
            
            # Convert to DataFrame
            df = pd.DataFrame(result_data)
            logger.info(f"Fetched {len(df)} classes")
            return df
        except Exception as e:
            logger.error(f"Error fetching classes: {e}")
            return pd.DataFrame()

classes_repo = ClassesRepository()