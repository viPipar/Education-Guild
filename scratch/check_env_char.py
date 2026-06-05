import os

env_path = r"c:\ProjectIEEE\.env"
with open(env_path, 'r', encoding='utf-8') as f:
    content = f.read()

idx = content.find("EIIX")
if idx != -1:
    sub = content[idx-20:idx+40]
    print("Found EIIX in .env at index:", idx)
    print("Substring around EIIX:", repr(sub))
else:
    print("EIIX not found in .env")
