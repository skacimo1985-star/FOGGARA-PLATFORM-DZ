import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/pages/Legal.tsx", import.meta.url),
  "utf8",
);

test("public legal pages follow the active application language", () => {
  assert.match(source, /useTranslation/);
  assert.match(source, /i18n\.language === "fr"/);
  assert.match(source, /i18n\.language === "en"/);
  assert.match(source, /dir=\{dir\}/);
  assert.doesNotMatch(source, /dir="rtl" lang="ar"/);
});

test("privacy and terms are available in Arabic French and English", () => {
  assert.match(source, /سياسة الخصوصية/);
  assert.match(source, /Politique de confidentialité/);
  assert.match(source, /Privacy policy/);
  assert.match(source, /شروط الاستخدام/);
  assert.match(source, /Conditions d’utilisation/);
  assert.match(source, /Terms of use/);
});

test("legal pages preserve verified-reference cautions and external source attribution", () => {
  assert.match(source, /18-07/);
  assert.match(source, /25-11/);
  assert.match(source, /18-05/);
  assert.match(source, /Wikimedia Commons/);
  assert.match(source, /CC BY 4\.0/);
});

test("contact consent follows the selected language and still links to privacy", () => {
  assert.match(source, /أوافق على معالجة/);
  assert.match(source, /J’accepte le traitement/);
  assert.match(source, /I agree to processing/);
  assert.match(source, /<Link to="\/privacy">/);
});
