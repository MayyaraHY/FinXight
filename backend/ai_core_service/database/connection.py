"""
Database connection management for SQL Server
Handles connection pooling, queries, and schema discovery
"""

import pyodbc
from sqlalchemy import create_engine, pool, text
from config.settings import settings
from typing import Optional, List, Dict, Any
import logging
import json

logger = logging.getLogger(__name__)


class DatabaseConnection:
    """
    Manages SQL Server connection and queries
    Handles connection pooling for performance
    """
    
    def __init__(self):
        """Initialize database connection"""
        self.engine = None
        self.connection_string = settings.sqlserver_connection_string
        self._initialize_connection()
    
    def _initialize_connection(self):
        """
        Create connection engine with pooling
        """
        try:
            # Create SQLAlchemy engine with connection pooling
            self.engine = create_engine(
                f"mssql+pyodbc:///?odbc_connect={self.connection_string}",
                poolclass=pool.QueuePool,
                pool_size=5,
                max_overflow=10,
                echo=settings.DEBUG
            )
            
            # Test connection
            with self.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            
            logger.info("✅ Connexion à la base de données établie")
            print("✅ Connexion à la base de données établie")
            
        except Exception as e:
            logger.error(f"❌ Échec de la connexion à la base de données: {str(e)}")
            print(f"❌ Échec de la connexion à la base de données: {str(e)}")
            raise
    
    def execute_query(self, query: str, params: Optional[Dict] = None) -> List[Dict[str, Any]]:
        """
        Execute a SELECT query and return results as list of dictionaries
        
        Args:
            query: SQL query string
            params: Query parameters (optional)
        
        Returns:
            List of dictionaries representing rows
        """
        try:
            with self.engine.connect() as conn:
                result = conn.execute(text(query), params or {})
                
                # Get column names
                columns = result.keys()
                
                # Convert rows to dictionaries
                rows = [dict(zip(columns, row)) for row in result]
                
                logger.info(f"Requête exécutée avec succès. Lignes: {len(rows)}")
                return rows
        
        except Exception as e:
            logger.error(f"Échec de l'exécution de la requête: {str(e)}")
            raise
    
    def get_tables(self) -> List[str]:
        """
        Get list of all tables in database
        
        Returns:
            List of table names
        """
        try:
            query = """
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME
            """
            result = self.execute_query(query)
            tables = [row['TABLE_NAME'] for row in result]
            return tables
        
        except Exception as e:
            logger.error(f"Échec de la récupération des tables: {str(e)}")
            raise
    
    def get_table_schema(self, table_name: str) -> List[Dict[str, Any]]:
        """
        Get schema information for a specific table
        
        Args:
            table_name: Name of the table
        
        Returns:
            List of column information dictionaries
        """
        try:
            query = f"""
            SELECT 
                COLUMN_NAME,
                DATA_TYPE,
                IS_NULLABLE,
                CHARACTER_MAXIMUM_LENGTH,
                NUMERIC_PRECISION,
                NUMERIC_SCALE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = '{table_name}'
            ORDER BY ORDINAL_POSITION
            """
            return self.execute_query(query)
        
        except Exception as e:
            logger.error(f"Échec de la récupération du schéma de la table: {str(e)}")
            raise
    
    def get_table_sample_data(self, table_name: str, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Get sample data from a table
        
        Args:
            table_name: Name of the table
            limit: Number of rows to retrieve
        
        Returns:
            List of sample rows as dictionaries
        """
        try:
            query = f"SELECT TOP {limit} * FROM [{table_name}]"
            return self.execute_query(query)
        
        except Exception as e:
            logger.error(f"Échec de la récupération des données d'exemple: {str(e)}")
            raise
    
    def get_table_info_formatted(self, table_name: str) -> str:
        """
        Get formatted table information (schema + sample data)
        Useful for sending to LLM
        
        Args:
            table_name: Name of the table
        
        Returns:
            Formatted string with schema and sample data
        """
        try:
            schema = self.get_table_schema(table_name)
            sample = self.get_table_sample_data(table_name, limit=3)
            
            info = f"\n📊 TABLE: {table_name}\n"
            info += "=" * 60 + "\n"
            
            # Schema info
            info += "COLONNES:\n"
            for col in schema:
                data_type = col['DATA_TYPE']
                nullable = col['IS_NULLABLE']
                info += f"  - {col['COLUMN_NAME']}: {data_type} (Nullable: {nullable})\n"
            
            # Sample data
            info += "\nDONNÉES D'EXEMPLE (Premières 3 lignes):\n"
            if sample:
                info += json.dumps(sample, indent=2, default=str)
            else:
                info += "  [Aucune donnée]"
            
            return info
        
        except Exception as e:
            logger.error(f"Échec de la récupération des informations de la table: {str(e)}")
            raise
    
    def close(self):
        """Fermer la connexion à la base de données"""
        if self.engine:
            self.engine.dispose()
            logger.info("Connexion à la base de données fermée")
            print("Connexion à la base de données fermée")


# Create singleton instance
db_connection = DatabaseConnection()