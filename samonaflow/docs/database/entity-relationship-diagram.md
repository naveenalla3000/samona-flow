Entity-relationship diagram of the samonaFlow Prisma schema (`prisma/schema.prisma`), showing primary and foreign keys only.

```mermaid
erDiagram
    UserProfile {
        uuid id PK
    }

    Business {
        uuid id PK
        uuid owner_id FK
    }

    BusinessMembership {
        uuid id PK
        uuid user_id FK
        uuid business_id FK
    }

    Customer {
        uuid id PK
        uuid business_id FK
    }

    Invoice {
        uuid id PK
        uuid business_id FK
        uuid customer_id FK
    }

    InvoiceItem {
        uuid id PK
        uuid business_id FK
        uuid invoice_id FK
    }

    Payment {
        uuid id PK
        uuid business_id FK
        uuid invoice_id FK
    }

    PaymentReversal {
        uuid id PK
        uuid business_id FK
        uuid payment_id FK
        uuid reversed_by_id FK
    }

    Expense {
        uuid id PK
        uuid business_id FK
    }

    Reminder {
        uuid id PK
        uuid business_id FK
        uuid customer_id FK
        uuid invoice_id FK
    }

    Alert {
        uuid id PK
        uuid business_id FK
    }

    UserProfile ||--o{ Business : "owns (owner_id)"
    UserProfile ||--o{ BusinessMembership : "has"
    UserProfile ||--o{ PaymentReversal : "reversedBy"

    Business ||--o{ BusinessMembership : "has"
    Business ||--o{ Customer : "has"
    Business ||--o{ Invoice : "has"
    Business ||--o{ InvoiceItem : "has"
    Business ||--o{ Payment : "has"
    Business ||--o{ PaymentReversal : "has"
    Business ||--o{ Expense : "has"
    Business ||--o{ Reminder : "has"
    Business ||--o{ Alert : "has"

    Customer ||--o{ Invoice : "billed on"
    Customer ||--o{ Reminder : "receives"

    Invoice ||--o{ InvoiceItem : "contains"
    Invoice ||--o{ Payment : "paid by"
    Invoice ||--o{ Reminder : "referenced by"

    Payment ||--o| PaymentReversal : "reversed by at most once"
```

Important relationships:

- Composite FK `Invoice(customer_id, business_id)` references `Customer(id, business_id)`.
- Composite FK `InvoiceItem(invoice_id, business_id)` references `Invoice(id, business_id)`; items cascade on invoice delete.
- Composite FK `Payment(invoice_id, business_id)` references `Invoice(id, business_id)`.
- Composite FK `Reminder(customer_id, business_id)` references `Customer(id, business_id)`.
- Composite FK `Reminder(invoice_id, customer_id, business_id)` references `Invoice(id, customer_id, business_id)`, so a reminder's customer must be the invoice's customer.
- Composite FK `PaymentReversal(payment_id, business_id)` references `Payment(id, business_id)`; `payment_id` is unique, so a payment is reversed at most once.
- `Alert.entity_id` (with `entity_type`) is a polymorphic reference to any entity. It has no foreign key.
