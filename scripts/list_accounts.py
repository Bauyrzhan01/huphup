import json
from collections import defaultdict
from pathlib import Path

users = json.loads(Path("data/users.json").read_text(encoding="utf-8"))
by_cat = defaultdict(list)
others = []
for u in users:
    if u.get("role") == "supplier" and u.get("supplier"):
        by_cat[u["supplier"].get("category", "?")].append(u)
    else:
        others.append(u)

lines = []
lines.append("# Все аккаунты TenderBauka\n")
lines.append("## Пользователи\n")
for u in others:
    pwd = "test1234" if u["email"] == "test.user.e2e@example.com" else "(твой пароль)"
    if u["email"].endswith("@tenderbauka.kz"):
        pwd = "demo1234"
    lines.append(f"- **{u['email']}** — {u['name']} — пароль: `{pwd}`")

lines.append("\n## Поставщики (пароль у всех: `demo1234`)\n")
for cat in sorted(by_cat.keys()):
    lines.append(f"\n### {cat}\n")
    for u in by_cat[cat]:
        c = u["supplier"].get("company_name", "")
        lines.append(f"- `{u['email']}` — {c}")

Path("ACCOUNTS.md").write_text("\n".join(lines), encoding="utf-8")
print(f"users={len(others)} suppliers={sum(len(v) for v in by_cat.values())}")
print("\n".join(lines[:40]))
print("...")
