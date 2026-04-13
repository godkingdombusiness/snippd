// lib/validate.js
export const sanitize = (input) => {
  if (typeof input !== 'string') return input;
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
};

export const validatePassword = (password) => {
  return typeof password === 'string' && password.length >= 8;
};

export const validateAmount = (amount) => {
  return !isNaN(amount) && Number(amount) >= 0 && Number(amount) < 100000;
};

export const validateZip = (zip) => {
  return /^\d{5}(-\d{4})?$/.test(zip);
};

export const validatePhone = (phone) => {
  return /^\+?[\d\s\-\(\)]{10,}$/.test(phone);
};

export const truncate = (str, max = 200) => {
  if (typeof str !== 'string') return '';
  return str.slice(0, max);
};