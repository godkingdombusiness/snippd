# Snippd Privacy Policy

**Last updated: April 14, 2026**
**Version: 1.0**

---

## 1. Introduction

Snippd ("we," "our," or "us") operates the Snippd mobile application (the "App"). This Privacy Policy explains how we collect, use, disclose, and protect your personal information when you use our App.

By creating a Snippd account, you agree to the collection and use of your information as described in this policy. If you do not agree, please do not use the App.

Contact us at: **privacy@getsnippd.com**

---

## 2. Information We Collect

### 2.1 Information You Provide

- **Account information** — email address, full name, password (stored as a hashed value; we never see your plain-text password)
- **Profile preferences** — household members (adult, child, senior, infant), dietary constraints (gluten-free, keto, etc.), cooking style, food dislikes
- **Budget information** — your weekly grocery budget target
- **Store preferences** — which retailers you prefer
- **Receipt photos** — images you upload for receipt verification; these are processed by our AI and deleted from temporary storage after scanning
- **Support messages** — any messages you send to support@getsnippd.com or through the in-app contact form

### 2.2 Information Collected Automatically

- **Behavioral events** — interactions within the App such as items viewed, coupons clipped, stacks saved, items added to cart, purchases completed, and search terms. These are used to personalize your experience.
- **Device information** — device type, operating system version, and app version. We do not collect your device's serial number or advertising ID.
- **Session information** — session identifiers used to group your activity within a single app session. Session IDs are not stored permanently.
- **Crash reports** — anonymous crash logs to help us fix bugs. These do not contain personal information.

### 2.3 Receipt Data

When you upload a receipt:
- The image is sent to our AI (Google Gemini) for text extraction only
- We extract item names, quantities, and prices
- We match extracted items against your shopping list and available deals
- The original image is not permanently stored on our servers
- Extracted line-item data is stored to calculate your savings and Stash Credits

---

## 3. How We Use Your Information

| Purpose | Data Used |
|---|---|
| Personalizing your cart recommendations | Behavioral events, preference scores, purchase history |
| Calculating your savings and Wealth Momentum | Receipt data, deal prices, USDA benchmarks |
| Awarding Stash Credits | Receipt verification, event milestones |
| Household sharing features | Household membership, shared cart items |
| Sending in-app alerts and insights | Behavioral patterns, budget thresholds |
| Improving our AI recommendation models | De-identified, aggregated behavioral signals |
| Security and fraud prevention | Session data, IP addresses (not stored long-term) |
| Legal compliance | Account data as required by law |

We do **not** sell your personal data to third parties.
We do **not** use your data for advertising outside of Snippd.

---

## 4. How We Share Your Information

### 4.1 Service Providers

We share data with the following service providers to operate the App:

- **Supabase** — cloud database and authentication (United States). Your account, events, and preferences are stored here.
- **Google Gemini** — AI receipt scanning. Receipt images are sent to Google's API for text extraction only.
- **Expo / React Native** — app runtime. Crash reports may be processed by Expo's diagnostics service.

### 4.2 Household Members

If you join a Household, your username, chef persona, and cart contributions are visible to other household members.

### 4.3 Aggregated and De-identified Data

When you delete your account, your behavioral events (item category, retailer, event type, week) are retained in aggregated form without any personal identifier. This aggregate data helps us improve recommendation quality for all users.

### 4.4 Legal Requirements

We may disclose your information if required by law, court order, or to protect the rights and safety of Snippd or its users.

---

## 5. Data Retention

| Data type | Retention period |
|---|---|
| Account information | Until you delete your account |
| Behavioral events | Until you delete your account |
| Receipt line items | Until you delete your account |
| User preference scores | Until you delete your account |
| Wealth momentum snapshots | Until you delete your account |
| Aggregated behavioral signals | Indefinitely (no personal identifier) |
| Support messages | 2 years from receipt |
| Crash reports | 90 days |

When you delete your account, all personal data is deleted within 24 hours.

---

## 6. Your Rights and Choices

### 6.1 Access and Correction
You can view and edit your profile information at any time in the App under **Profile → Edit Profile**.

### 6.2 Data Deletion
You can delete your account — and all associated personal data — at any time from **Profile → Delete Account**. Deletion is permanent and cannot be undone.

### 6.3 Opt-out of Personalization
You can reset your preference scores by clearing your profile history (contact support to request this if the option is not yet in the App).

### 6.4 California Residents (CCPA)
If you are a California resident, you have the right to:
- Know what personal information we collect
- Request deletion of your personal information
- Opt out of the sale of personal information (note: we do not sell personal information)
- Non-discrimination for exercising your rights

To exercise these rights, email **privacy@getsnippd.com**.

### 6.5 EU/UK Residents (GDPR)
If you are located in the EU or UK, you have the right to access, rectify, erase, restrict, and port your personal data. You also have the right to lodge a complaint with your local supervisory authority. Contact us at **privacy@getsnippd.com** to exercise these rights.

---

## 7. Security

We take security seriously:

- All data is encrypted in transit using TLS 1.2+
- Passwords are hashed using industry-standard algorithms (bcrypt via Supabase Auth)
- Row Level Security (RLS) ensures users can only access their own data
- Service role keys (used by backend jobs) are stored as encrypted secrets, not in code
- Two-factor authentication (TOTP) is available and encouraged

No system is 100% secure. If you discover a security vulnerability, please report it responsibly to **security@getsnippd.com**.

---

## 8. Children's Privacy

Snippd is not directed at children under 13. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided us information, please contact **privacy@getsnippd.com** and we will delete it promptly.

---

## 9. Third-Party Links

The App may contain links to external websites (e.g., retailer apps, coupon pages). We are not responsible for the privacy practices of those sites. Please review their privacy policies before providing any personal information.

---

## 10. Changes to This Policy

We may update this Privacy Policy from time to time. When we do, we will:
- Update the "Last updated" date at the top of this document
- Increment the version number
- Notify you through the App or by email if the changes are material

Continued use of the App after changes constitutes acceptance of the updated policy.

---

## 11. Contact Us

For privacy questions, requests, or complaints:

**Email:** privacy@getsnippd.com
**Subject line:** "Privacy Request — [your name]"

We will respond within 30 days.

---

*Snippd — Autonomous Shopping Intelligence*
*Version 1.0 — April 14, 2026*
