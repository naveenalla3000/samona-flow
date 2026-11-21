# samonaFlow Data Dictionary

Source of truth: `samonaflow/prisma/schema.prisma`. Names and types here are copied from that file.

- **Column** is the PostgreSQL column name (the `@map` value). **Prisma field** is the camelCase field name.
- Relation-only fields (for example `Business.owner`) are not columns and are not listed.
- Text fields default to `TEXT` unless the schema sets `@db.VarChar`, `@db.Char` or `@db.Text`.
- Primary keys are `UUID` with no database default. Prisma generates them with `uuid()` in the client.
- `createdAt` is `DEFAULT CURRENT_TIMESTAMP`. `updatedAt` is set by Prisma on write and has no database default.
- `ON DELETE` values come from the Prisma relation. For composite foreign keys, the action applies to the whole key.

---

## user_profiles (`UserProfile`)

| Column | Prisma field | PostgreSQL type | Nullable | Constraints | Description |
|---|---|---|---|---|---|
| id | id | UUID | NO | PK | Supabase Auth user UUID. Never generated here. |
| email | email | TEXT | NO | UNIQUE | Email mirrored from Supabase Auth. |
| full_name | fullName | TEXT | YES | | Display name. |
| created_at | createdAt | TIMESTAMPTZ(6) | NO | DEFAULT CURRENT_TIMESTAMP | Row creation time. |
| updated_at | updatedAt | TIMESTAMPTZ(6) | NO | Set by Prisma on write | Last update time. |

**Table-level constraints and indexes**
- `PRIMARY KEY (id)`
- `@unique email`

---

## businesses (`Business`)

| Column | Prisma field | PostgreSQL type | Nullable | Constraints | Description |
|---|---|---|---|---|---|
| id | id | UUID | NO | PK | Business identifier. |
| owner_id | ownerId | UUID | NO | FK -> user_profiles(id) ON DELETE RESTRICT; indexed | Owner user. |
| name | name | VARCHAR(200) | NO | | Business name. |
| owner_name | ownerName | TEXT | NO | | Owner's display name. |
| email | email | TEXT | NO | | Business contact email. |
| phone | phone | TEXT | YES | | Business contact phone. |
| business_type | businessType | TEXT | NO | | Free-text business type. |
| currency | currency | CHAR(3) | NO | DEFAULT 'INR' | ISO 4217 code. Source for the invoice currency snapshot. |
| timezone | timezone | TEXT | NO | DEFAULT 'Asia/Kolkata' | IANA timezone name. Used for business-local dates. |
| opening_balance | openingBalance | NUMERIC(12,2) | NO | DEFAULT 0 | Opening cash balance. |
| opening_balance_date | openingBalanceDate | DATE | NO | | Business-local date of the opening balance. |
| created_at | createdAt | TIMESTAMPTZ(6) | NO | DEFAULT CURRENT_TIMESTAMP | Row creation time. |
| updated_at | updatedAt | TIMESTAMPTZ(6) | NO | Set by Prisma on write | Last update time. |

**Table-level constraints and indexes**
- `PRIMARY KEY (id)`
- `@@index([ownerId])` (`owner_id`)

---

## business_memberships (`BusinessMembership`)

| Column | Prisma field | PostgreSQL type | Nullable | Constraints | Description |
|---|---|---|---|---|---|
| id | id | UUID | NO | PK | Membership identifier. |
| user_id | userId | UUID | NO | FK -> user_profiles(id) ON DELETE CASCADE; part of unique key | Member user. |
| business_id | businessId | UUID | NO | FK -> businesses(id) ON DELETE CASCADE; indexed | Business the user belongs to. |
| role | role | business_role | NO | Enum `business_role` | Membership role. Only OWNER is used in MVP. |
| created_at | createdAt | TIMESTAMPTZ(6) | NO | DEFAULT CURRENT_TIMESTAMP | Row creation time. |

**Table-level constraints and indexes**
- `PRIMARY KEY (id)`
- `@@unique([userId, businessId])` (`user_id`, `business_id`). One membership per user per business.
- `@@index([businessId])`

---

## customers (`Customer`)

| Column | Prisma field | PostgreSQL type | Nullable | Constraints | Description |
|---|---|---|---|---|---|
| id | id | UUID | NO | PK; target of composite FKs | Customer identifier. |
| business_id | businessId | UUID | NO | FK -> businesses(id) ON DELETE RESTRICT; indexed via composite indexes | Owning business. |
| name | name | VARCHAR(200) | NO | | Customer name. |
| email | email | TEXT | YES | | Customer email. |
| phone | phone | TEXT | YES | | Customer phone. |
| company_name | companyName | TEXT | YES | | Customer company name. |
| address | address | TEXT | YES | | Postal address. |
| notes | notes | TEXT | YES | | Internal notes. |
| archived_at | archivedAt | TIMESTAMPTZ(6) | YES | | Set when archived. Archived rows are kept. |
| created_at | createdAt | TIMESTAMPTZ(6) | NO | DEFAULT CURRENT_TIMESTAMP | Row creation time. |
| updated_at | updatedAt | TIMESTAMPTZ(6) | NO | Set by Prisma on write | Last update time. |

**Table-level constraints and indexes**
- `PRIMARY KEY (id)`
- `@@unique([id, businessId])` (`id`, `business_id`). Target of composite foreign keys.
- `@@index([businessId, archivedAt])`
- `@@index([businessId, name])`

---

## invoices (`Invoice`)

| Column | Prisma field | PostgreSQL type | Nullable | Constraints | Description |
|---|---|---|---|---|---|
| id | id | UUID | NO | PK; target of composite FKs | Invoice identifier. |
| business_id | businessId | UUID | NO | FK -> businesses(id) ON DELETE RESTRICT | Owning business. |
| customer_id | customerId | UUID | NO | Composite FK (customer_id, business_id) -> customers(id, business_id) ON DELETE RESTRICT; indexed | Customer. Must belong to the same business. |
| invoice_number | invoiceNumber | TEXT | NO | Unique with business_id | Invoice number, unique per business. |
| issue_date | issueDate | DATE | NO | | Business-local issue date. |
| due_date | dueDate | DATE | NO | | Business-local due date. |
| expected_payment_date | expectedPaymentDate | DATE | YES | | Customer's expected payment date. |
| status | status | invoice_status | NO | DEFAULT 'DRAFT'; indexed with business_id | Invoice status. OVERDUE is a cached value refreshed by the service. |
| subtotal | subtotal | NUMERIC(12,2) | NO | | Sum of line totals before discount and tax. |
| discount | discount | NUMERIC(12,2) | NO | DEFAULT 0 | Discount amount. |
| tax | tax | NUMERIC(12,2) | NO | DEFAULT 0 | Tax amount. |
| total_amount | totalAmount | NUMERIC(12,2) | NO | | Invoice total. |
| currency | currency | CHAR(3) | NO | No default. Snapshot from the business currency at creation. Must not change after the invoice leaves DRAFT. | ISO 4217 currency snapshot of the invoice. |
| notes | notes | TEXT | YES | | Invoice notes. |
| public_token_hash | publicTokenHash | TEXT | YES | UNIQUE | SHA-256 hex digest of the public payment-link token. The raw token is never stored. |
| public_token_revoked_at | publicTokenRevokedAt | TIMESTAMPTZ(6) | YES | | Set when the public payment link is revoked. |
| created_at | createdAt | TIMESTAMPTZ(6) | NO | DEFAULT CURRENT_TIMESTAMP | Row creation time. |
| updated_at | updatedAt | TIMESTAMPTZ(6) | NO | Set by Prisma on write | Last update time. |

**Table-level constraints and indexes**
- `PRIMARY KEY (id)`
- `@@unique([businessId, invoiceNumber])` (`business_id`, `invoice_number`)
- `@@unique([id, businessId])`. Target of composite foreign keys from items and payments.
- `@@unique([id, customerId, businessId])`. Target of the composite foreign key from reminders, which pins a reminder to the invoice's customer.
- `@@index([businessId, status])`
- `@@index([businessId, dueDate])`
- `@@index([customerId])`
- `UNIQUE (public_token_hash)` (field-level `@unique`)

---

## invoice_items (`InvoiceItem`)

| Column | Prisma field | PostgreSQL type | Nullable | Constraints | Description |
|---|---|---|---|---|---|
| id | id | UUID | NO | PK | Item identifier. |
| business_id | businessId | UUID | NO | FK -> businesses(id) ON DELETE RESTRICT | Owning business. Carried so the composite FK enforces tenancy. |
| invoice_id | invoiceId | UUID | NO | Composite FK (invoice_id, business_id) -> invoices(id, business_id) ON DELETE CASCADE; indexed | Parent invoice. |
| description | description | TEXT | NO | | Line item description. |
| quantity | quantity | NUMERIC(10,2) | NO | | Quantity. |
| unit_price | unitPrice | NUMERIC(12,2) | NO | | Price per unit. |
| line_total | lineTotal | NUMERIC(12,2) | NO | | Line total. |
| position | position | INTEGER | NO | Unique with invoice_id | Line order within the invoice. |
| created_at | createdAt | TIMESTAMPTZ(6) | NO | DEFAULT CURRENT_TIMESTAMP | Row creation time. |

**Table-level constraints and indexes**
- `PRIMARY KEY (id)`
- `@@unique([invoiceId, position])` (`invoice_id`, `position`)
- `@@index([invoiceId])`

---

## payments (`Payment`)

Append-only. There is no `updated_at`.

| Column | Prisma field | PostgreSQL type | Nullable | Constraints | Description |
|---|---|---|---|---|---|
| id | id | UUID | NO | PK; target of composite FK | Payment identifier. |
| business_id | businessId | UUID | NO | FK -> businesses(id) ON DELETE RESTRICT | Owning business. |
| invoice_id | invoiceId | UUID | NO | Composite FK (invoice_id, business_id) -> invoices(id, business_id) ON DELETE RESTRICT; indexed | Invoice this payment applies to. |
| amount | amount | NUMERIC(12,2) | NO | | Payment amount. |
| payment_date | paymentDate | DATE | NO | Indexed with business_id | Business-local payment date. |
| method | method | payment_method | NO | Enum `payment_method` | Payment method. |
| transaction_reference | transactionReference | TEXT | YES | | External transaction reference. |
| notes | notes | TEXT | YES | | Payment notes. |
| created_at | createdAt | TIMESTAMPTZ(6) | NO | DEFAULT CURRENT_TIMESTAMP | Row creation time. |

**Table-level constraints and indexes**
- `PRIMARY KEY (id)`
- `@@unique([id, businessId])`. Target of the `payment_reversals` composite foreign key.
- `@@index([invoiceId])`
- `@@index([businessId, paymentDate])`

---

## payment_reversals (`PaymentReversal`)

Append-only reversal event. There is no `updated_at` and no delete path. A payment can be reversed at most once.

| Column | Prisma field | PostgreSQL type | Nullable | Constraints | Description |
|---|---|---|---|---|---|
| id | id | UUID | NO | PK | Reversal identifier. |
| business_id | businessId | UUID | NO | FK -> businesses(id) ON DELETE RESTRICT | Owning business. |
| payment_id | paymentId | UUID | NO | Composite FK (payment_id, business_id) -> payments(id, business_id) ON DELETE RESTRICT; UNIQUE | Reversed payment. Each payment can be reversed once. |
| reversed_by_id | reversedById | UUID | NO | FK -> user_profiles(id) ON DELETE RESTRICT. Not indexed. | User who recorded the reversal. |
| reason | reason | TEXT | NO | | Reason for the reversal. |
| reversed_at | reversedAt | TIMESTAMPTZ(6) | NO | DEFAULT CURRENT_TIMESTAMP | Time the reversal took effect. |
| created_at | createdAt | TIMESTAMPTZ(6) | NO | DEFAULT CURRENT_TIMESTAMP | Row creation time. |

**Table-level constraints and indexes**
- `PRIMARY KEY (id)`
- `@@unique([paymentId])` (`payment_id`). One reversal per payment.

---

## expenses (`Expense`)

| Column | Prisma field | PostgreSQL type | Nullable | Constraints | Description |
|---|---|---|---|---|---|
| id | id | UUID | NO | PK | Expense identifier. |
| business_id | businessId | UUID | NO | FK -> businesses(id) ON DELETE RESTRICT; indexed with status and due_date | Owning business. |
| title | title | TEXT | NO | | Expense title. |
| category | category | expense_category | NO | Enum `expense_category` | Expense category. |
| amount | amount | NUMERIC(12,2) | NO | | Expense amount. |
| due_date | dueDate | DATE | NO | | Business-local due date. |
| payment_date | paymentDate | DATE | YES | | Business-local date the expense was paid. |
| status | status | expense_status | NO | DEFAULT 'UPCOMING' | Expense status. |
| notes | notes | TEXT | YES | | Expense notes. |
| created_at | createdAt | TIMESTAMPTZ(6) | NO | DEFAULT CURRENT_TIMESTAMP | Row creation time. |
| updated_at | updatedAt | TIMESTAMPTZ(6) | NO | Set by Prisma on write | Last update time. |

**Table-level constraints and indexes**
- `PRIMARY KEY (id)`
- `@@index([businessId, status, dueDate])`

---

## reminders (`Reminder`)

| Column | Prisma field | PostgreSQL type | Nullable | Constraints | Description |
|---|---|---|---|---|---|
| id | id | UUID | NO | PK | Reminder identifier. |
| business_id | businessId | UUID | NO | FK -> businesses(id) ON DELETE RESTRICT | Owning business. |
| customer_id | customerId | UUID | NO | Composite FK (customer_id, business_id) -> customers(id, business_id) ON DELETE RESTRICT; indexed | Customer. Must belong to the same business. |
| invoice_id | invoiceId | UUID | NO | Composite FK (invoice_id, customer_id, business_id) -> invoices(id, customer_id, business_id) ON DELETE RESTRICT; indexed | Invoice. Its customer must match `customer_id`, which pins the reminder to the invoice's customer. |
| reminder_type | reminderType | reminder_type | NO | Enum `reminder_type` | Reminder type. |
| status | status | reminder_status | NO | DEFAULT 'DRAFTED' | Reminder status. Opening WhatsApp is not delivery. Only MARKED_SENT is set by the user. |
| message | message | TEXT | NO | | Reminder message text. |
| follow_up_date | followUpDate | DATE | YES | Indexed with business_id | Business-local follow-up date. |
| created_at | createdAt | TIMESTAMPTZ(6) | NO | DEFAULT CURRENT_TIMESTAMP | Row creation time. |
| updated_at | updatedAt | TIMESTAMPTZ(6) | NO | Set by Prisma on write | Last update time. |

**Table-level constraints and indexes**
- `PRIMARY KEY (id)`
- `@@index([invoiceId])`
- `@@index([customerId])`
- `@@index([businessId, followUpDate])`

---

## alerts (`Alert`)

| Column | Prisma field | PostgreSQL type | Nullable | Constraints | Description |
|---|---|---|---|---|---|
| id | id | UUID | NO | PK | Alert identifier. |
| business_id | businessId | UUID | NO | FK -> businesses(id) ON DELETE RESTRICT; indexed | Owning business. |
| alert_type | alertType | alert_type | NO | Enum `alert_type` | Alert type. |
| severity | severity | alert_severity | NO | Enum `alert_severity` | Alert severity. |
| title | title | TEXT | NO | | Alert title. |
| description | description | TEXT | NO | | Alert description. |
| entity_type | entityType | TEXT | YES | No FK (polymorphic) | Type name of the referenced entity. |
| entity_id | entityId | UUID | YES | No FK (polymorphic) | Identifier of the referenced entity. |
| dedupe_key | dedupeKey | TEXT | YES | Indexed with business_id. Planned partial unique index on (business_id, dedupe_key) WHERE resolved_at IS NULL, migration TODO. | Stable key such as `OVERDUE:<invoiceId>`, used to prevent duplicate active alerts. |
| is_read | isRead | BOOLEAN | NO | DEFAULT false | Whether the user has read the alert. |
| read_at | readAt | TIMESTAMPTZ(6) | YES | | Time the alert was read. |
| resolved_at | resolvedAt | TIMESTAMPTZ(6) | YES | | Time the alert was resolved. |
| created_at | createdAt | TIMESTAMPTZ(6) | NO | DEFAULT CURRENT_TIMESTAMP | Row creation time. |

**Table-level constraints and indexes**
- `PRIMARY KEY (id)`
- `@@index([businessId, resolvedAt])`
- `@@index([businessId, dedupeKey])`
- Planned, not in Prisma: partial unique index on `(business_id, dedupe_key) WHERE resolved_at IS NULL`.

---

## Enums

| PostgreSQL type | Prisma enum | Values |
|---|---|---|
| business_role | BusinessRole | OWNER, STAFF (reserved; only OWNER is used in MVP) |
| invoice_status | InvoiceStatus | DRAFT, SENT, PARTIALLY_PAID, PAID, OVERDUE, VOID |
| payment_method | PaymentMethod | UPI, BANK_TRANSFER, CASH, OTHER |
| expense_category | ExpenseCategory | RENT, INTERNET, SOFTWARE_SUBSCRIPTIONS, SALARIES, EQUIPMENT, MARKETING, TRAVEL, UTILITIES, OTHER |
| expense_status | ExpenseStatus | UPCOMING, OVERDUE, PAID, CANCELLED |
| reminder_type | ReminderType | UPCOMING_PAYMENT, DUE_TODAY, OVERDUE_PAYMENT, FINAL_FOLLOW_UP |
| reminder_status | ReminderStatus | DRAFTED, WHATSAPP_OPENED, MARKED_SENT |
| alert_type | AlertType | OVERDUE_PAYMENT, PAYMENT_APPROACHING, POTENTIAL_SHORTAGE, UPCOMING_EXPENSE, PARTIAL_PAYMENT_DUE, CUSTOMER_CONCENTRATION |
| alert_severity | AlertSeverity | INFO, WARNING, CRITICAL |
