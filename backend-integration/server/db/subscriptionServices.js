// ─── processSubscriptionUpsert ─────────────────────────────────────────
    // 1. Extract dates and format them.
    // 2. Loop through subscription.items.
    // 3. Call Stripe API to fetch product metadata for each item.
    // 4. Build the parent and child data objects.
    // 5. Call dbQueries.js to upsert the data.          
// ──────────────────────────────────────────────────────────────────────────────────

// ─── processSubscriptionCancellation ─────────────────────────────────────────
    // 1. Extract the subId and canceled_at timestamp.
    // 2. Call dbQueries.js to update current_state to 'canceled'.
    // 3. Log the event in subscription_events.
// ──────────────────────────────────────────────────────────────────────────────────

// ─── processInvoiceEvent ─────────────────────────────────────────

    // 1. Check if invoice.subscription exists (ignore one-offs).
    // 2. Extract amount_paid, status, and generated dates.
    // 3. Look inside invoice.lines to find the specific stripe_item_id ('si_...').
    // 4. Call dbQueries.js to increment the item's number_of_renovations.
    // 5. Call dbQueries.js to update the parent's last_invoice_* columns.
// ──────────────────────────────────────────────────────────────────────────────────

