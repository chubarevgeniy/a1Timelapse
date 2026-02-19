from playwright.sync_api import sync_playwright

def verify_app():
    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        # Navigate to the app (we need to serve it first, assuming it's served at port 4173 after preview)
        # Note: We will need to start the preview server in a separate process before running this
        try:
            page.goto("http://localhost:4173")

            # Wait for content to load
            page.wait_for_selector("h1")

            # Take a screenshot of the initial state (Loading or Uploader)
            page.screenshot(path="/home/jules/verification/app_screenshot.png")
            print("Screenshot taken successfully")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_app()
