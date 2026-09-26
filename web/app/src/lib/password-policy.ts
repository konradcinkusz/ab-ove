/**
 * What the identity service accepts as a new password, for the browser to check first.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * READ FROM THE PINNED AUTHSERVICE, NOT GUESSED (issue #166).
 *
 * `/register` stated five rules and the browser checked one of them, `minlength`, so a
 * reader typing `password1` met the rules only as the identity service's refusal, a round
 * trip later. The rules are these, at the tag `flyio/authservice.fly.toml` pins (v0.3.1):
 *
 *   `Program.cs`            `options.Password.RequireDigit`, `RequireLowercase`,
 *                           `RequireUppercase`, `RequireNonAlphanumeric`, `RequiredLength = 8`;
 *   `DTOs/AuthDtos.cs`      `RegisterRequest.Password` is `[StringLength(100, MinimumLength = 8)]`,
 *                           which `[ApiController]` enforces before the controller runs — so
 *                           there is a CEILING as well as a floor, and the words on the page
 *                           never said so (`register.ts` measured the refusal it gives).
 *
 * and ASP.NET Identity's `PasswordValidator` decides what each class means, which is
 * narrower than a reader would guess: a digit is `'0'`–`'9'`, a lower case letter `'a'`–`'z'`,
 * an upper case letter `'A'`–`'Z'`, and "non alphanumeric" is any character that is none of
 * those three — so `ą`, `Ł` and a space all count as the symbol, and none of them counts as a
 * letter. A Polish reader's `Łódź` has no upper case letter as far as the service is
 * concerned, which is why the words say *from A to Z* (`chrome.ts`, `registerPage`).
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * TWO ATTRIBUTES, AND WHY THE LENGTH IS SPLIT BETWEEN THEM.
 *
 * The floor is `minlength`, which counts UTF-16 code units exactly as .NET's `string.Length`
 * does, and whose own message says how many characters are missing. The four classes and
 * the ceiling are `pattern`. The ceiling is not `maxlength`: that attribute stops the field
 * taking a 101st character rather than refusing it, so a longer password pasted in would be
 * cut short in silence and the account made under a password the reader never chose. A
 * pattern refuses instead. Its cost is that a pattern counts code points (the browser
 * compiles it with the `v` flag), so a password made of astral characters — emoji, say — can
 * pass here and still be over the service's hundred code units; the service refuses it, and
 * the page says so in the same words.
 *
 * NO `.` IN THE PATTERN. A dot does not match a line terminator, and a password field strips
 * only CR and LF from its value — U+2028 and U+2029 stay, the service counts either as the
 * character that is none of the other three, and a dot-based pattern would refuse a password
 * the service accepts. So each class is looked for past a run of everything that is not it,
 * and the length is counted over `[\s\S]`, which is every code point.
 *
 * The fixture that stands in for authservice in the acceptance suite states the same rules
 * (`tests/e2e/fixtures/authservice-stub.mts`); `password-policy.test.ts` holds this file to
 * a transcription of the validator above.
 */

/** `RequiredLength`, and `[StringLength]`'s `MinimumLength`. */
export const PASSWORD_MIN_LENGTH = 8;

/** `[StringLength]`'s maximum on `RegisterRequest.Password`. */
export const PASSWORD_MAX_LENGTH = 100;

/**
 * The `pattern` attribute: one of each class somewhere, and no more than the ceiling. The
 * browser anchors it itself — it matches `^(?:…)$` — so it carries no anchors of its own, and
 * it has to compile under the `u` flag of a browser that predates `v` as well as under `v`,
 * because a pattern that does not compile is ignored rather than reported.
 */
export const PASSWORD_PATTERN =
  '(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z])(?=[^0-9]*[0-9])(?=[a-zA-Z0-9]*[^a-zA-Z0-9])' +
  `[\\s\\S]{0,${PASSWORD_MAX_LENGTH}}`;
