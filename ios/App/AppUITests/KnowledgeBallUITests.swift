import XCTest

final class KnowledgeBallUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 20), "The packaged WKWebView did not start")
    }

    private func firstButton(_ webView: XCUIElement, matching predicate: NSPredicate, timeout: TimeInterval = 5) -> XCUIElement {
        let button = webView.buttons.matching(predicate).firstMatch
        XCTAssertTrue(button.waitForExistence(timeout: timeout), "Expected Web button is missing: \(predicate)")
        return button
    }

    private func firstAccessibleElement(_ root: XCUIElement, matching predicate: NSPredicate, timeout: TimeInterval = 5) -> XCUIElement {
        let element = root.descendants(matching: .any).matching(predicate).firstMatch
        XCTAssertTrue(element.waitForExistence(timeout: timeout), "Expected accessible Web element is missing: \(predicate)")
        return element
    }

    func testPackagedWebParitySmoke() throws {
        let webView = app.webViews.firstMatch
        XCTAssertTrue(firstAccessibleElement(webView, matching: NSPredicate(format: "label == 'KNOWLEDGE BALL'"), timeout: 15).exists, "Web shell is blank")
        XCTAssertGreaterThan(webView.descendants(matching: .any).count, 10, "The packaged Web product did not expose a populated accessibility tree")

        // Settings + shared zh-CN/en product UI. WebKit may expose HTML headings
        // and labels as different XCUI element classes across iOS versions, so
        // text assertions intentionally follow the accessibility label rather
        // than assuming every heading/label becomes XCUIElementTypeStaticText.
        let settings = firstButton(webView, matching: NSPredicate(format: "label CONTAINS[c] 'Settings' OR label CONTAINS '设置'"), timeout: 10)
        settings.tap()
        XCTAssertTrue(firstAccessibleElement(webView, matching: NSPredicate(format: "label == 'Settings' OR label == '设置'"), timeout: 5).exists)
        XCTAssertTrue(firstAccessibleElement(webView, matching: NSPredicate(format: "label == 'Language' OR label == '语言'"), timeout: 5).exists, "Language control is missing")

        let locale = webView.popUpButtons.firstMatch
        XCTAssertTrue(locale.exists, "Language selector is not tappable")
        locale.tap()
        let picker = app.pickerWheels.firstMatch
        if picker.waitForExistence(timeout: 2) {
            picker.adjust(toPickerWheelValue: "English")
            if app.buttons["Done"].exists { app.buttons["Done"].tap() }
        } else {
            let english = app.buttons["English"]
            XCTAssertTrue(english.waitForExistence(timeout: 2), "English locale option is missing")
            english.tap()
        }
        XCTAssertTrue(firstAccessibleElement(webView, matching: NSPredicate(format: "label == 'Language'"), timeout: 5).exists, "Language switch did not update Web UI")
        firstButton(webView, matching: NSPredicate(format: "label CONTAINS[c] 'Back to Knowledge Ball' OR label CONTAINS[c] 'Close' OR label CONTAINS '返回知识球' OR label CONTAINS '关闭'")).tap()

        // Current -> Personal -> All -> Current must be the same product state machine as Web.
        let current = firstButton(webView, matching: NSPredicate(format: "label == 'Current' OR label == '当前'"))
        current.tap()
        let personal = firstButton(webView, matching: NSPredicate(format: "label == 'Personal' OR label == '个人'"))
        personal.tap()
        let all = firstButton(webView, matching: NSPredicate(format: "label == 'All' OR label == '全部'"))
        all.tap()
        XCTAssertTrue(firstButton(webView, matching: NSPredicate(format: "label == 'Current' OR label == '当前'")).exists)

        // Native iOS must expose the same AccountUiController product surface.
        let account = firstButton(webView, matching: NSPredicate(format: "label CONTAINS[c] 'Account' OR label CONTAINS '账户' OR label CONTAINS '个人'"), timeout: 8)
        account.tap()
        XCTAssertTrue(firstAccessibleElement(webView, matching: NSPredicate(format: "label CONTAINS[c] 'My energy' OR label CONTAINS '我的能量'"), timeout: 8).exists, "Shared Account UI did not open")
        XCTAssertTrue(firstAccessibleElement(webView, matching: NSPredicate(format: "label CONTAINS[c] 'Register / Sign in' OR label CONTAINS '注册 / 登录'"), timeout: 5).exists, "Shared authentication UI is missing")
        firstButton(webView, matching: NSPredicate(format: "label CONTAINS[c] 'Back to Knowledge Ball' OR label CONTAINS[c] 'Close' OR label CONTAINS '返回知识球' OR label CONTAINS '关闭'")).tap()

        // Search a seeded user-authored node instead of assuming a particular 3D label is currently inside the label budget.
        let search = webView.textFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5), "Search input is missing")
        search.tap()
        search.typeText("质数的定义")
        let searchResult = firstAccessibleElement(webView, matching: NSPredicate(format: "label == '质数的定义'"), timeout: 10)
        searchResult.tap()

        // The current near-node detail and optimization menu must be interactable inside WKWebView.
        let edit = firstButton(webView, matching: NSPredicate(format: "label == 'Edit' OR label == '编辑'"), timeout: 8)
        edit.tap()
        let optimize = firstButton(webView, matching: NSPredicate(format: "label == 'Optimize' OR label == '优化'"), timeout: 5)
        XCTAssertTrue(optimize.isHittable, "Optimization action exists but is not hittable")
        optimize.tap()
        XCTAssertTrue(firstAccessibleElement(webView, matching: NSPredicate(format: "label CONTAINS[c] 'Edit node' OR label CONTAINS '编辑节点'"), timeout: 8).exists, "Optimization did not enter the current editor")

        // Back out of the editor and verify create validation on the current split-create surface.
        let editorBack = firstButton(webView, matching: NSPredicate(format: "label CONTAINS[c] 'Back' OR label CONTAINS '返回'"), timeout: 5)
        editorBack.tap()
        if webView.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Back' OR label CONTAINS '返回'")).firstMatch.exists {
            webView.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Back' OR label CONTAINS '返回'")).firstMatch.tap()
        }

        // Keyboard shortcut exercises the same KnowledgeCreateController used by Web.
        app.typeKey("n", modifierFlags: .control)
        let submit = firstButton(webView, matching: NSPredicate(format: "label CONTAINS[c] 'Submit' OR label CONTAINS '提交'"), timeout: 8)
        submit.tap()
        XCTAssertTrue(firstAccessibleElement(webView, matching: NSPredicate(format: "label CONTAINS[c] 'Enter' OR label CONTAINS '请填写'"), timeout: 5).exists, "Create validation feedback is not visible")

        // Real app lifecycle resume must preserve the WKWebView product surface.
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(webView.waitForExistence(timeout: 10), "Resume replaced the Web state")
        XCTAssertTrue(firstAccessibleElement(webView, matching: NSPredicate(format: "label == 'KNOWLEDGE BALL'"), timeout: 5).exists, "Product shell disappeared after resume")

        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "ios-packaged-parity"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
