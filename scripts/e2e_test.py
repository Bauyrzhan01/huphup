"""End-to-end smoke test: register → request → offer → accept → message → complete → rate."""
import sys
from io import BytesIO
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import app, load_requests, load_users, save_users, load_catalog

passed = 0
failed = 0


def check(name, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  OK  {name}")
    else:
        failed += 1
        print(f" FAIL {name} {detail}")


def bootstrap_csrf(client):
    r = client.get("/register")
    token = r.headers.get("X-CSRF-Token") or ""
    check("csrf bootstrap", r.status_code == 200 and bool(token), token[:12])
    return {"X-CSRF-Token": token, "Content-Type": "application/json"}


def refresh_csrf(client, headers):
    r = client.get("/login")
    token = r.headers.get("X-CSRF-Token") or headers.get("X-CSRF-Token")
    headers["X-CSRF-Token"] = token
    return headers


def api_post(client, path, headers, payload):
    return client.post(path, json=payload, headers=headers)


def main():
    client = app.test_client()
    headers = bootstrap_csrf(client)

    print("\n=== 1. Auth: user login ===")
    email_user = "test.user.e2e@example.com"
    email_sup = "test.supplier.e2e@example.com"

    users = [u for u in load_users() if u["email"] not in (email_user, email_sup)]
    save_users(users)

    r = api_post(
        client,
        "/api/register",
        headers,
        {
            "role": "user",
            "name": "Тест Пользователь",
            "email": email_user,
            "password": "test1234",
        },
    )
    data = r.get_json() or {}
    check("register user start", r.status_code == 200 and data.get("ok"), data)
    if data.get("needs_verification"):
        code = data.get("dev_code")
        check("dev verify code issued", bool(code), data)
        r = api_post(
            client,
            "/api/register/verify",
            headers,
            {"email": email_user, "code": code},
        )
        data = r.get_json() or {}
        check("register user verify", r.status_code == 200 and data.get("ok"), data)
    check("redirect home", data.get("redirect") == "/home", data)
    headers = refresh_csrf(client, headers)

    r = client.get("/home")
    check("user home page", r.status_code == 200 and "Добрый день" in r.get_data(as_text=True))

    r = client.get("/dashboard")
    if r.status_code == 302:
        check("user dash redirects home", "/home" in (r.headers.get("Location") or ""))
    else:
        check("user blocked from supplier dash", r.status_code in (302, 200))

    print("\n=== 2. Create request (cement) ===")
    r = api_post(
        client,
        "/api/requests",
        headers,
        {"text": "Нужен цемент и кирпич для стройки", "confirm": True},
    )
    data = r.get_json() or {}
    check("create request", r.status_code == 200 and data.get("ok"), data)
    req = data.get("request") or {}
    check(
        "categories detected",
        "Стройматериалы" in (req.get("matched_categories") or []),
        req.get("matched_categories"),
    )
    check("suppliers found", len(req.get("suppliers") or []) > 0, len(req.get("suppliers") or []))
    check("request sent status", req.get("status") == "sent")
    request_id = req.get("id")
    supplier_ids = req.get("supplier_ids") or []
    check("has supplier ids", len(supplier_ids) > 0)

    r = client.get("/api/requests")
    data = r.get_json() or {}
    check(
        "user sees own requests",
        r.status_code == 200 and any(x["id"] == request_id for x in data.get("items", [])),
    )

    print("\n=== 3. IT request matching ===")
    r = api_post(
        client,
        "/api/requests",
        headers,
        {"text": "Нужен сайт и CRM система для компании", "confirm": True},
    )
    data = r.get_json() or {}
    check("IT request ok", r.status_code == 200 and data.get("ok"), data)
    it_req = data.get("request") or {}
    check(
        "IT category",
        "IT и ПО" in (it_req.get("matched_categories") or []),
        it_req.get("matched_categories"),
    )
    it_companies = [s["company_name"] for s in it_req.get("suppliers") or []]
    check(
        "IT suppliers include Digital Steppe or CodeForge",
        any("Digital" in c or "CodeForge" in c or "SoftNova" in c for c in it_companies),
        it_companies,
    )

    print("\n=== 4. Validation + CSRF ===")
    r = api_post(client, "/api/requests", headers, {"text": "ab"})
    check("short text rejected", r.status_code == 400)
    r = client.post("/api/requests", json={"text": "Нужен цемент без csrf", "confirm": True})
    check("csrf required", r.status_code == 403)

    print("\n=== 5. Product_id request ===")
    catalog = load_catalog()
    product = next(
        (p for p in (catalog.get("products") or []) if p.get("id") and p.get("supplier_id")),
        None,
    )
    check("catalog has product", product is not None)
    product_req_id = None
    if product:
        r = api_post(
            client,
            "/api/requests",
            headers,
            {"product_id": product["id"], "confirm": True},
        )
        data = r.get_json() or {}
        check("product_id request ok", r.status_code == 200 and data.get("ok"), data)
        preq = data.get("request") or {}
        product_req_id = preq.get("id")
        check("product_id stored", preq.get("product_id") == product["id"], preq.get("product_id"))
        check(
            "preferred supplier pinned",
            product["supplier_id"] in (preq.get("supplier_ids") or []),
            preq.get("supplier_ids"),
        )

    print("\n=== 6. Supplier offer ===")
    client.get("/logout")
    headers = bootstrap_csrf(client)

    users = load_users()
    target = None
    for u in users:
        if u["id"] in supplier_ids and str(u.get("email") or "").endswith("@tenderbauka.kz"):
            target = u
            break
    check("found demo supplier for offer", target is not None, supplier_ids[:3])

    offer_id = None
    if target:
        r = api_post(
            client,
            "/api/login",
            headers,
            {"email": target["email"], "password": "demo1234"},
        )
        data = r.get_json() or {}
        check("supplier login", r.status_code == 200 and data.get("ok"), data)
        check("supplier redirect dash", data.get("redirect") == "/dashboard", data)
        headers = refresh_csrf(client, headers)

        r = client.get("/dashboard")
        check(
            "supplier dashboard",
            r.status_code == 200 and "Входящие заявки" in r.get_data(as_text=True),
        )

        r = client.get("/api/requests")
        data = r.get_json() or {}
        check(
            "supplier sees incoming",
            r.status_code == 200 and any(x["id"] == request_id for x in data.get("items", [])),
            data,
        )

        r = api_post(
            client,
            f"/api/requests/{request_id}/offer",
            headers,
            {"price": "450000", "message": "Цемент М400 и кирпич, доставка включена"},
        )
        data = r.get_json() or {}
        check("supplier send offer", r.status_code == 200 and data.get("ok"), data)
        check(
            "offer saved",
            (data.get("request") or {}).get("my_offer", {}).get("price") == "450000",
        )

        r = api_post(
            client,
            f"/api/requests/{request_id}/offer",
            headers,
            {"price": "430000", "message": "Обновлённая цена"},
        )
        data = r.get_json() or {}
        check("supplier update offer", r.status_code == 200 and data.get("ok"))
        my_offer = (data.get("request") or {}).get("my_offer") or {}
        check("offer updated price", my_offer.get("price") == "430000")
        offer_id = my_offer.get("id")

    print("\n=== 7. Accept → message → complete → rate ===")
    client.get("/logout")
    headers = bootstrap_csrf(client)
    r = api_post(client, "/api/login", headers, {"email": email_user, "password": "test1234"})
    check("user re-login", r.status_code == 200 and (r.get_json() or {}).get("ok"))
    headers = refresh_csrf(client, headers)

    r = client.get("/api/requests")
    data = r.get_json() or {}
    item = next((x for x in data.get("items", []) if x["id"] == request_id), None)
    check("user request found", item is not None)
    if item:
        check("user sees offers", len(item.get("offers") or []) >= 1, item.get("offers"))
        if item.get("offers"):
            check("offer price visible", item["offers"][0]["price"] == "430000", item["offers"][0])
            check("offer has company", bool(item["offers"][0].get("company_name")))
            offer_id = offer_id or item["offers"][0].get("id")

    if offer_id and request_id:
        r = api_post(
            client,
            f"/api/requests/{request_id}/accept",
            headers,
            {"offer_id": offer_id},
        )
        data = r.get_json() or {}
        check("accept offer", r.status_code == 200 and data.get("ok"), data)
        check("status deal", (data.get("request") or {}).get("status") == "deal")

        r = client.post(
            f"/api/requests/{request_id}/attachments",
            data={"file": (BytesIO(b"%PDF-1.4\n%EOF"), "e2e.pdf")},
            headers={"X-CSRF-Token": headers.get("X-CSRF-Token", "")},
        )
        data = r.get_json() or {}
        check("upload attachment", r.status_code == 200 and data.get("ok"), data)
        att_id = (data.get("attachment") or {}).get("id")

        r = api_post(
            client,
            f"/api/requests/{request_id}/messages",
            headers,
            {"text": "КП во вложении", "attachment_id": att_id},
        )
        data = r.get_json() or {}
        check("deal message with attachment", r.status_code == 200 and data.get("ok"), data)
        msgs = data.get("messages") or []
        check(
            "attachment in messages",
            any((m.get("attachment") or {}).get("id") == att_id for m in msgs),
        )

        r = api_post(
            client,
            f"/api/requests/{request_id}/messages",
            headers,
            {"text": "Добрый день, когда доставка?"},
        )
        data = r.get_json() or {}
        check("deal message", r.status_code == 200 and data.get("ok"), data)

        r = api_post(client, f"/api/requests/{request_id}/complete", headers, {})
        data = r.get_json() or {}
        check("complete deal", r.status_code == 200 and data.get("ok"), data)
        check("status completed", (data.get("request") or {}).get("status") == "completed")

        r = api_post(
            client,
            f"/api/requests/{request_id}/rate",
            headers,
            {"score": 5, "comment": "Отлично"},
        )
        data = r.get_json() or {}
        check("rate partner", r.status_code == 200 and data.get("ok"), data)

    print("\n=== 8. Supplier cannot create request ===")
    if target:
        client.get("/logout")
        headers = bootstrap_csrf(client)
        api_post(client, "/api/login", headers, {"email": target["email"], "password": "demo1234"})
        headers = refresh_csrf(client, headers)
        r = api_post(
            client,
            "/api/requests",
            headers,
            {"text": "Хочу создать заявку как поставщик", "confirm": True},
        )
        check("supplier create blocked", r.status_code == 403)

        print("\n=== 8b. Team invite → manager offer ===")
        r = api_post(client, "/api/team/invite", headers, {})
        data = r.get_json() or {}
        check("owner creates invite", r.status_code == 200 and data.get("ok"), data)
        token = data.get("token") or ""
        check("invite token", bool(token), data)

        mgr_email = "test.manager.e2e@example.com"
        users = [u for u in load_users() if u.get("email") != mgr_email]
        save_users(users)

        client.get("/logout")
        headers = bootstrap_csrf(client)
        r = api_post(
            client,
            "/api/register",
            headers,
            {
                "role": "supplier",
                "name": "Менеджер Тест",
                "email": mgr_email,
                "password": "test1234",
                "invite": token,
            },
        )
        data = r.get_json() or {}
        check("manager register start", r.status_code == 200 and data.get("ok"), data)
        if data.get("needs_verification"):
            code = data.get("dev_code")
            check("manager verify code", bool(code), data)
            r = api_post(
                client,
                "/api/register/verify",
                headers,
                {"email": mgr_email, "code": code},
            )
            data = r.get_json() or {}
            check("manager verify ok", r.status_code == 200 and data.get("ok"), data)
        check("manager redirect dashboard", data.get("redirect") == "/dashboard", data)
        headers = refresh_csrf(client, headers)

        from app import find_user_by_email, company_id as _cid, supplier_role_of

        mgr = find_user_by_email(mgr_email)
        check("manager role", supplier_role_of(mgr) == "manager", mgr)
        check("manager company", _cid(mgr) == target["id"], (_cid(mgr), target["id"]))

        # create buyer request that matches this supplier
        client.get("/logout")
        headers = bootstrap_csrf(client)
        api_post(
            client,
            "/api/login",
            headers,
            {"email": email_user, "password": "test1234"},
        )
        headers = refresh_csrf(client, headers)
        r = api_post(
            client,
            "/api/requests",
            headers,
            {"text": "Нужен цемент М400 для стройки в Астане", "confirm": True},
        )
        data = r.get_json() or {}
        check("buyer request for team", r.status_code == 200 and data.get("ok"), data)
        team_req = data.get("request") or {}
        team_req_id = team_req.get("id")
        check(
            "company in supplier_ids",
            target["id"] in (team_req.get("supplier_ids") or []),
            team_req.get("supplier_ids"),
        )

        client.get("/logout")
        headers = bootstrap_csrf(client)
        api_post(client, "/api/login", headers, {"email": mgr_email, "password": "test1234"})
        headers = refresh_csrf(client, headers)
        if team_req_id and target["id"] in (team_req.get("supplier_ids") or []):
            r = api_post(
                client,
                f"/api/requests/{team_req_id}/offer",
                headers,
                {"price": "111000", "message": "от менеджера"},
            )
            data = r.get_json() or {}
            check("manager offer ok", r.status_code == 200 and data.get("ok"), data)
            my = (data.get("request") or {}).get("my_offer") or {}
            check("offer as company id", my.get("supplier_id") == target["id"], my)
            check("acted_by manager", my.get("acted_by_name") == "Менеджер Тест", my)

            client.get("/logout")
            headers = bootstrap_csrf(client)
            api_post(
                client,
                "/api/login",
                headers,
                {"email": target["email"], "password": "demo1234"},
            )
            headers = refresh_csrf(client, headers)
            r = client.get("/api/team/activity")
            data = r.get_json() or {}
            check("owner sees activity", r.status_code == 200 and data.get("ok"), data)
            acts = data.get("items") or []
            check(
                "activity has manager offer",
                any(a.get("acted_by_name") == "Менеджер Тест" for a in acts),
                acts[:3],
            )

    print("\n=== 9. Pages load ===")
    client.get("/logout")
    for path in ["/", "/login", "/register"]:
        r = client.get(path)
        check(f"page {path}", r.status_code == 200)

    print("\n=== RESULT ===")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    if product_req_id:
        print(f"Product request id: {product_req_id}")
    # silence unused
    _ = load_requests
    return failed == 0


if __name__ == "__main__":
    ok = main()
    raise SystemExit(0 if ok else 1)
