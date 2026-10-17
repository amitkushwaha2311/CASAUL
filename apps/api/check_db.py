import sqlite3
db = sqlite3.connect("test.db")
tables = db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
print("Tables:", [t[0] for t in tables])
db.close()
