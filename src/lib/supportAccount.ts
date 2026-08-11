// حساب الدعم الرسمي لمنصة كتبي — يُستخدم لإظهار شارة التوثيق الخاصة بالدعم
export const KOTOBI_SUPPORT_USER_ID = 'badcee33-6a57-4e31-9004-d276276d2d28';

// بُرد الدعم المعروفة (الحساب الرسمي + البريد المستخدم سابقاً في صفحة الاقتراحات)
export const KOTOBI_SUPPORT_EMAILS = [
  'adileboura@gmail.com',
  'h85342727@gmail.com',
  'support@kotobi.com',
];

export const KOTOBI_SUPPORT_USERNAMES = ['support kotobi', 'kotobi support', 'دعم كتبي'];

interface SupportCandidate {
  id?: string | null;
  userId?: string | null;
  email?: string | null;
  username?: string | null;
}

export const isKotobiSupportAccount = (candidate?: SupportCandidate | string | null): boolean => {
  if (!candidate) return false;

  if (typeof candidate === 'string') {
    const value = candidate.trim().toLowerCase();
    if (!value) return false;
    return (
      value === KOTOBI_SUPPORT_USER_ID.toLowerCase() ||
      KOTOBI_SUPPORT_EMAILS.includes(value) ||
      KOTOBI_SUPPORT_USERNAMES.includes(value)
    );
  }

  const id = (candidate.id || candidate.userId || '').trim().toLowerCase();
  if (id && id === KOTOBI_SUPPORT_USER_ID.toLowerCase()) return true;

  const email = (candidate.email || '').trim().toLowerCase();
  if (email && KOTOBI_SUPPORT_EMAILS.includes(email)) return true;

  const username = (candidate.username || '').trim().toLowerCase();
  if (username && KOTOBI_SUPPORT_USERNAMES.includes(username)) return true;

  return false;
};
