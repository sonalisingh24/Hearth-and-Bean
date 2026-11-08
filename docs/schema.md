   # Data model (PostgreSQL)

   **menu_items**: id (PK), name, category, description, price, available
   **orders**: id (PK), name, phone, note, total, status, created_at
   **order_items**: id (PK), order_id (FK to orders), menu_item_id (FK to menu_items), name, price, qty
   **reservations**: id (PK), name, phone, date, time, guests, notes, status, created_at
   **messages**: id (PK), name, email, message, created_at

   An order has many order_items. Each row in order_items stores one dish, its price
   at the time of ordering, and the quantity. order_items.order_id links back to orders.id.