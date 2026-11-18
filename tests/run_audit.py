# Szabály- és stratégia-ellenőrzés: kivágja a motort az ulti.html-ből, és lefuttatja rajta az ellenőrzéseket.
# Használat: python3 tests/run_audit.py   (Node.js kell hozzá)
import os,subprocess,tempfile
d=os.path.dirname(os.path.abspath(__file__))
s=open(os.path.join(d,'..','ulti.html'),encoding='utf-8').read()
a=s.index('// ===== ENGINE START');b=s.index('// ===== ENGINE END')
body=open(os.path.join(d,'audit_body.js'),encoding='utf-8').read()
with tempfile.NamedTemporaryFile('w',suffix='.js',delete=False,encoding='utf-8') as f:f.write(s[a:b]+body);p=f.name
subprocess.run(['node',p])
