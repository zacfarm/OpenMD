export const MIN_PASSWORD_LENGTH = 8;

const HAS_NUMBER_REGEX = /\d/;
const HAS_SPECIAL_CHARACTER_REGEX = /[^A-Za-z0-9]/;

export const PASSWORD_POLICY_HINTS = [
  `At least ${MIN_PASSWORD_LENGTH} characters`,
  "At least 1 number",
  "At least 1 special character",
] as const;

export function getPasswordPolicyError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (!HAS_NUMBER_REGEX.test(password)) {
    return "Password must include at least 1 number.";
  }

  if (!HAS_SPECIAL_CHARACTER_REGEX.test(password)) {
    return "Password must include at least 1 special character.";
  }

  return null;
}
