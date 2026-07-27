"""Capture UI screenshots for visual review."""
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5001"
OUT = Path("ui_shots")
OUT.mkdir(exist_ok=True)


def shot(page, name):
    path = OUT / f"{name}.png"
    page.screenshot(path=str(path), full_page=True)
    print(f"saved {path}")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})

        page.goto(f"{BASE}/")
        page.wait_for_load_state("networkidle")
        shot(page, "01_landing")

        page.goto(f"{BASE}/login")
        page.wait_for_load_state("networkidle")
        shot(page, "02_login")

        page.goto(f"{BASE}/register")
        page.wait_for_load_state("networkidle")
        shot(page, "03_register")

        # user home
        page.goto(f"{BASE}/login")
        page.fill('input[name="email"]', "test.user.e2e@example.com")
        page.fill('input[name="password"]', "test1234")
        page.click('button[type="submit"]')
        page.wait_for_url("**/home")
        page.wait_for_timeout(500)
        shot(page, "04_user_home")

        page.fill("#search-input", "Нужен цемент и кирпич для стройки")
        page.click('button[type="submit"]')
        page.wait_for_selector("#results:not([hidden])", timeout=10000)
        page.wait_for_timeout(800)
        shot(page, "05_user_results")

        # click history if available
        items = page.locator("#history-list .shell-side-item")
        if items.count() > 0:
            items.first.click()
            page.wait_for_timeout(500)
            shot(page, "06_user_history_open")

        # supplier dashboard
        page.goto(f"{BASE}/logout")
        page.goto(f"{BASE}/login")
        page.fill('input[name="email"]', "demo.stroymarketastana@tenderbauka.kz")
        page.fill('input[name="password"]', "demo1234")
        page.click('button[type="submit"]')
        page.wait_for_url("**/dashboard")
        page.wait_for_selector("#supplier-requests .request-card, #supplier-requests .shell-side-empty", timeout=10000)
        page.wait_for_timeout(800)
        shot(page, "07_supplier_requests")

        # scroll to profile
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(400)
        shot(page, "08_supplier_profile")

        browser.close()
        print("DONE")


if __name__ == "__main__":
    main()
