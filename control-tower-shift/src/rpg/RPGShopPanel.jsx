import { useMemo, useRef, useState } from 'react'
import { ALL_ITEM_DEFS } from './crafting.js'
import { SHOP_DEFS, quoteBuy, quoteSell } from './economy.js'
import { carriedItemQuantity } from './progression.js'

const RESULT_COPY = Object.freeze({
  insufficient_funds: 'You do not have enough drachmae.',
  insufficient_stock: 'Myrrine does not have that many in stock.',
  inventory_full: 'Your backpack does not have enough open slots.',
  insufficient_items: 'You are not carrying that many.',
  overflow: 'That trade is too large to record safely.',
})

function outcomeText(result) {
  if (!result) return 'Choose an item and quantity. Every trade settles immediately.'
  const item = ALL_ITEM_DEFS[result.itemId]
  if (result.ok) {
    const verb = result.reason === 'bought' ? 'Bought' : 'Sold'
    return `${verb} ${result.quantity} ${item?.name || result.itemId} for ${result.total} drachmae.`
  }
  return RESULT_COPY[result.reason] || 'That trade could not be completed.'
}

export default function RPGShopPanel({ state, dispatch }) {
  const [mode, setMode] = useState('buy')
  const sequenceRef = useRef(state.economy?.transactionSequence || 0)
  const shopId = state.economy?.openShopId
  const shop = SHOP_DEFS[shopId]
  const inventory = state.inventory
  const economy = state.economy
  const openSlots = Math.max(0, (inventory.capacity || 28) - (inventory.slots?.length || 0))

  const sellable = useMemo(() => Object.values(shop?.listings || {})
    .map((listing) => ({ ...listing, carried: carriedItemQuantity(inventory, listing.itemId, ALL_ITEM_DEFS) }))
    .filter((listing) => listing.carried > 0), [inventory, shop])

  if (!shop) return <p className="rpg-panel-note">This merchant is no longer available. Close the ledger and approach them again.</p>

  const trade = (operation, itemId, quantity) => {
    const sequence = sequenceRef.current
    sequenceRef.current += 1
    dispatch({
      type: operation === 'buy' ? 'SHOP_BUY' : 'SHOP_SELL',
      itemId,
      quantity,
      transactionId: `${shopId}:${operation}:${state.playtimeTicks}:${sequence}`,
    })
  }

  return (
    <div className="rpg-shop" data-shop-id={shopId}>
      <div className="rpg-inventory-summary">
        <span>{inventory.currency || 0} drachmae</span>
        <span>{inventory.slots?.length || 0} / {inventory.capacity || 28} backpack slots</span>
      </div>
      <div className="rpg-shop-mode" aria-label="Trade direction">
        <button type="button" aria-pressed={mode === 'buy'} onClick={() => setMode('buy')}>Buy</button>
        <button type="button" aria-pressed={mode === 'sell'} onClick={() => setMode('sell')}>Sell</button>
      </div>
      <p className="rpg-shop-status" role="status" aria-live="polite">{outcomeText(economy.lastResult)}</p>

      {mode === 'buy' ? (
        <ul className="rpg-shop-list" aria-label={`${shop.name} stock`}>
          {Object.values(shop.listings).map((listing) => {
            const item = ALL_ITEM_DEFS[listing.itemId]
            const stock = economy.shops?.[shopId]?.stock?.[listing.itemId] ?? 0
            const carried = carriedItemQuantity(inventory, listing.itemId, ALL_ITEM_DEFS)
            const reasonId = `shop-buy-reason-${listing.itemId}`
            return (
              <li key={listing.itemId} className="rpg-shop-entry">
                <div className="rpg-shop-item-copy">
                  <strong>{item.name}</strong>
                  <span>{listing.buyPrice} drachmae each · {stock} in stock · {carried} carried</span>
                </div>
                <div className="rpg-shop-actions">
                  {[1, 5, 10].map((quantity) => {
                    const quote = quoteBuy(economy, shopId, listing.itemId, quantity)
                    const reason = stock < quantity
                      ? 'Not enough stock.'
                      : inventory.currency < quote.total
                        ? 'Not enough drachmae.'
                        : !item.stackable && openSlots < quantity
                          ? 'Not enough backpack slots.'
                          : ''
                    return (
                      <button
                        key={quantity}
                        type="button"
                        disabled={Boolean(reason)}
                        aria-describedby={reason ? reasonId : undefined}
                        aria-label={`Buy ${quantity} ${item.name} for ${quote.total} drachmae`}
                        onClick={() => trade('buy', listing.itemId, quantity)}
                      >Buy {quantity}</button>
                    )
                  })}
                </div>
                <small id={reasonId}>{stock === 0 ? 'Sold out. Stock returns while you play.' : 'Purchases need currency and open backpack space.'}</small>
              </li>
            )
          })}
        </ul>
      ) : sellable.length ? (
        <ul className="rpg-shop-list" aria-label="Items Myrrine will buy">
          {sellable.map((listing) => {
            const item = ALL_ITEM_DEFS[listing.itemId]
            const quantities = [...new Set([1, Math.min(5, listing.carried), listing.carried])]
            return (
              <li key={listing.itemId} className="rpg-shop-entry">
                <div className="rpg-shop-item-copy">
                  <strong>{item.name}</strong>
                  <span>{listing.sellPrice} drachmae each · {listing.carried} carried</span>
                </div>
                <div className="rpg-shop-actions">
                  {quantities.map((quantity) => {
                    const quote = quoteSell(shopId, listing.itemId, quantity)
                    return (
                      <button
                        key={quantity}
                        type="button"
                        aria-label={`Sell ${quantity} ${item.name} for ${quote.total} drachmae`}
                        onClick={() => trade('sell', listing.itemId, quantity)}
                      >{quantity === listing.carried ? 'Sell all' : `Sell ${quantity}`}</button>
                    )
                  })}
                </div>
                <small>Only carried items are traded. Banked supplies remain untouched.</small>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="rpg-panel-note">You are not carrying anything Myrrine buys. Gather supplies or withdraw them from the Storehouse.</p>
      )}
    </div>
  )
}
