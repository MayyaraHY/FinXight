"""
Database migration script to add display_filename column to uploads table.
Run this script if you're upgrading from a version without display_filename support.

Usage:
    python migrations.py
"""

from sqlalchemy import Column, String, text, inspect
from app.db.cnx import engine, Base
from app.models.upload import Upload

def add_display_filename_column():
    """Add display_filename column to uploads table if it doesn't exist."""
    
    with engine.connect() as connection:
        inspector = inspect(engine)
        
        # Check if uploads table exists
        if 'uploads' not in inspector.get_table_names():
            print("⚠️  uploads table does not exist. Running create_all()...")
            Base.metadata.create_all(bind=engine)
            print("✅ Database tables created successfully.")
            return
        
        # Get columns of uploads table
        columns = inspector.get_columns('uploads')
        column_names = [col['name'] for col in columns]
        
        # Check if display_filename column already exists
        if 'display_filename' in column_names:
            print("✅ display_filename column already exists. No migration needed.")
            return
        
        # Add display_filename column
        print("Adding display_filename column to uploads table...")
        
        db_url = str(engine.url)
        if 'sqlite' in db_url:
            # SQLite syntax
            alter_query = text("""
                ALTER TABLE uploads ADD COLUMN display_filename VARCHAR;
            """)
        elif 'mysql' in db_url or 'mariadb' in db_url:
            # MySQL/MariaDB syntax
            alter_query = text("""
                ALTER TABLE uploads ADD COLUMN display_filename VARCHAR(500) NULL;
            """)
        elif 'postgresql' in db_url:
            # PostgreSQL syntax
            alter_query = text("""
                ALTER TABLE uploads ADD COLUMN display_filename VARCHAR NULL;
            """)
        else:
            raise ValueError(f"Unsupported database: {db_url}")
        
        try:
            connection.execute(alter_query)
            connection.commit()
            print("✅ display_filename column added successfully.")
        except Exception as e:
            print(f"❌ Error adding column: {str(e)}")
            raise

if __name__ == "__main__":
    print("Starting database migration...\n")
    add_display_filename_column()
    print("\n✅ Migration completed!")
