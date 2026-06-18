import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Verifies the mobile breakpoint safety net is present in source CSS and
 * the root document meta — so that built APK assets (which inline these)
 * will hide the desktop sidebar and prevent horizontal scrolling on
 * phones (<768px).
 *
 * This is a static check on the sources that Vite bundles verbatim into
 * dist/ and android/app/src/main/assets/public/. If these assertions fail,
 * the APK will regress to the old desktop-sidebar-on-mobile bug.
 */
describe("Mobile layout safety net (<768px)", () => {
  const stylesPath = path.resolve(process.cwd(), "src/styles.css");
  const rootPath = path.resolve(process.cwd(), "src/routes/__root.tsx");
  const css = fs.readFileSync(stylesPath, "utf-8");
  const root = fs.readFileSync(rootPath, "utf-8");

  it("styles.css declares a @media (max-width: 767px) block", () => {
    expect(css).toMatch(/@media\s*\(\s*max-width:\s*767px\s*\)/);
  });

  it("mobile block hides the desktop <aside> sidebar", () => {
    // aside.hidden.md:flex must be force-hidden on phones
    expect(css).toMatch(/aside\.hidden\\?\.md\\?:flex[\s\S]*?display:\s*none\s*!important/);
  });

  it("mobile block prevents horizontal scrolling on html/body/#root", () => {
    const mobileBlock = css.split(/@media\s*\(\s*max-width:\s*767px\s*\)/)[1] ?? "";
    expect(mobileBlock).toMatch(/html\s*,\s*body\s*,\s*#root/);
    expect(mobileBlock).toMatch(/overflow-x:\s*hidden/);
    expect(mobileBlock).toMatch(/max-width:\s*100vw/);
  });

  it("mobile block lets <main> fill the viewport (no sidebar push)", () => {
    const mobileBlock = css.split(/@media\s*\(\s*max-width:\s*767px\s*\)/)[1] ?? "";
    expect(mobileBlock).toMatch(/main\s*{[\s\S]*?width:\s*100%\s*!important/);
    expect(mobileBlock).toMatch(/main\s*{[\s\S]*?margin-left:\s*0\s*!important/);
  });

  it("__root.tsx ships a mobile-ready viewport meta tag", () => {
    // width=device-width is the minimum requirement for the APK WebView
    // to honor CSS breakpoints. viewport-fit=cover handles notches.
    expect(root).toMatch(/name:\s*["']viewport["']/);
    expect(root).toMatch(/width=device-width/);
    expect(root).toMatch(/viewport-fit=cover/);
  });
});
