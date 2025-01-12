import sqlite3

def check_records():
    try:
        conn = sqlite3.connect('scripts.db')
        c = conn.cursor()
        c.execute('SELECT COUNT(*) FROM script_records')
        count = c.fetchone()[0]
        print(f"Total records: {count}")
        
        if count > 0:
            c.execute('SELECT * FROM script_records ORDER BY timestamp DESC')
            records = c.fetchall()
            print("\nLatest records:")
            for r in records[:3]:  # Show latest 3 records
                print(f"ID: {r[0]}")
                print(f"Timestamp: {r[1]}")
                print(f"Duration: {r[2]}")
                print(f"URL: {r[4]}")
                print(f"Prompt: {r[5]}")
                print("-" * 50)
        
        conn.close()
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == '__main__':
    check_records()
