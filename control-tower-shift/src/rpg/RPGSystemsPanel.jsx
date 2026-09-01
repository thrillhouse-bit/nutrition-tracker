// RPGSystemsPanel — Wilderness / Crafting field journal.
//
// A compact tabbed HTML overlay reading directly from the existing domain
// layers (crafting.js, wilderness.js, progression.js). It owns no game rules:
// every affordance either reads a pure domain function or dispatches an
// existing reducer event (state.js). Combat resolution is out of scope —
// Engage only requests it via onEngageEnemy.
import React, { useMemo, useState } from 'react'
import './systems-panel.css'
import { ALL_ITEM_DEFS, RECIPES } from './crafting.js'
import {
  CRAFTING_SOURCE_MODES,
  quoteCraftingLedger,
} from './craftingLedger.js'
import { REGIONS, ENEMY_DEFS_BY_ID, combatLevelForSkills, protectedItemCount } from './wilderness.js'
import { levelForXp, SKILL_DEF_BY_ID } from './progression.js'
import { craftingAccessDecision, wildernessAccessDecision } from './systemAccess.js'
import { rpgMapById } from './registry.js'

const TABS = Object.freeze([
  { id: 'wilderness', label: 'Wilderness' },
  { id: 'crafting', label: 'Crafting' },
])

const CRAFT_REASON_TEXT = Object.freeze({
  unknown_recipe: 'Unknown recipe.',
  invalid_quantity: 'Invalid quantity.',
  wrong_station: 'Not made at this station.',
  level_too_low: 'Skill level too low.',
  insufficient_materials: 'Missing ingredients.',
  insufficient_inventory_capacity: 'Not enough backpack space.',
  bank_access_required: 'Bank materials require a physical bank beside this station.',
  invalid_source_mode: 'That material source is unavailable.',
})

function itemName(itemId) {
  return ALL_ITEM_DEFS[itemId]?.name || itemId
}

function skillName(skillId) {
  return SKILL_DEF_BY_ID[skillId]?.name || skillId
}

function craftUnavailableReason(result) {
  if (!result || result.ok) return ''
  return CRAFT_REASON_TEXT[result.reason] || 'Cannot craft right now.'
}

function stationLabel(stationId) {
  return String(stationId)
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function craftStatusMessage(lastResult) {
  if (!lastResult) return ''
  if (!lastResult.ok) return craftUnavailableReason(lastResult)
  const provenance = (lastResult.deductions || [])
    .map((entry) => `${itemName(entry.itemId)}: ${entry.carried} carried, ${entry.bank} bank`)
    .join('; ')
  return `Crafted ×${lastResult.quantity} (+${lastResult.xpAwarded} XP).${provenance ? ` Materials — ${provenance}.` : ''}`
}

export default function RPGSystemsPanel({ state, dispatch, onEngageEnemy }) {
  const [activeTab, setActiveTab] = useState('wilderness')
  const [useBankMaterials, setUseBankMaterials] = useState(false)

  const skills = state?.progression?.skills
  const inventory = state?.inventory
  const wilderness = state?.wilderness || {}
  const crafting = state?.crafting || {}
  const mapId = state?.world?.mapId
  const bankAvailable = Boolean(rpgMapById(mapId)?.entities?.some((entity) => entity.kind === 'bank'))
  const sourceMode = useBankMaterials && bankAvailable
    ? CRAFTING_SOURCE_MODES.CARRIED_AND_BANK
    : CRAFTING_SOURCE_MODES.CARRIED_ONLY

  const combatLevel = useMemo(() => combatLevelForSkills(skills), [skills])

  const stationIds = useMemo(() => {
    const seen = []
    for (const recipe of RECIPES) {
      if (!seen.includes(recipe.stationId)) seen.push(recipe.stationId)
    }
    return seen
  }, [])

  const recipesAtStation = useMemo(
    () => RECIPES.filter((recipe) => recipe.stationId === crafting.stationId),
    [crafting.stationId],
  )

  const pendingEnemy = wilderness.pendingEnemyId ? ENEMY_DEFS_BY_ID[wilderness.pendingEnemyId] : null
  const activeRegion = REGIONS.find((region) => region.id === wilderness.regionId) || null
  const activeWildernessAccess = wilderness.regionId
    ? wildernessAccessDecision(mapId, wilderness.regionId)
    : null
  const activeCraftingAccess = crafting.stationId
    ? craftingAccessDecision(mapId, crafting.stationId)
    : null
  const protectedCount = protectedItemCount({
    riskBand: wilderness.riskBand,
    skulled: wilderness.skulled,
    devotionActive: wilderness.devotionActive,
  })

  const handleEnterRegion = (regionId) => {
    if (!wildernessAccessDecision(mapId, regionId)?.available) return
    dispatch({ type: 'WILDERNESS_ENTER', regionId })
  }
  const handleStep = () => dispatch({ type: 'WILDERNESS_STEP' })
  const handleExit = () => dispatch({ type: 'WILDERNESS_EXIT' })
  const handleOpenStation = (stationId) => {
    if (!craftingAccessDecision(mapId, stationId)?.available) return
    dispatch({ type: 'OPEN_CRAFTING', stationId })
  }
  const handleCloseStation = () => dispatch({ type: 'CLOSE_CRAFTING' })
  const handleCraft = (recipeId) => {
    if (!activeCraftingAccess?.available) return
    dispatch({ type: 'CRAFT', recipeId, quantity: 1, sourceMode })
  }
  const handleEngage = () => {
    if (!onEngageEnemy || !wilderness.pendingEnemyId) return
    const encounterKey = `${wilderness.regionId}:${wilderness.step}:${wilderness.pendingEnemyId}`
    onEngageEnemy({ enemyId: wilderness.pendingEnemyId, encounterKey })
  }

  return (
    <section className="rsp-panel rsp-cut" aria-label="Systems journal">
      <div className="rsp-tablist" role="tablist" aria-label="Systems">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`rsp-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`rsp-tabpanel-${tab.id}`}
            className={`rsp-tab${activeTab === tab.id ? ' is-active' : ''}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'wilderness' && (
        <div id="rsp-tabpanel-wilderness" role="tabpanel" aria-labelledby="rsp-tab-wilderness" className="rsp-tabpanel">
          <p className="rsp-combat-level">
            Combat level <strong>{combatLevel}</strong>
          </p>

          {wilderness.lastDeathDrop && (
            <div className="rsp-death-drop" role="status">
              <p className="rsp-death-drop-title">Wilderness death — {wilderness.lastDeathDrop.cause || 'defeat'}</p>
              <p>
                Lost {wilderness.lastDeathDrop.dropped?.length || 0} item(s) and{' '}
                {wilderness.lastDeathDrop.lostCurrency || 0} drachmae.
              </p>
              {wilderness.lastDeathDrop.dropped?.length > 0 && (
                <ul className="rsp-death-drop-list">
                  {wilderness.lastDeathDrop.dropped.map((entry, index) => (
                    <li key={`${entry.itemId}-${index}`}>
                      {itemName(entry.itemId)} ×{entry.quantity}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!wilderness.regionId ? (
            <ul className="rsp-region-list">
              {REGIONS.map((region) => {
                const access = wildernessAccessDecision(mapId, region.id)
                const available = access?.available === true
                const reasonId = `rsp-wilderness-access-${region.id}`
                const reason = access?.reason || 'This wilderness entrance is unavailable from the current location.'
                return (
                <li key={region.id} className={`rsp-region-card rsp-cut${available ? '' : ' is-unavailable'}`}>
                  <div className="rsp-region-head">
                    <strong>{region.name}</strong>
                    <span className={`rsp-risk-badge rsp-risk-${region.riskBand}`}>{region.riskBand}</span>
                  </div>
                  <dl className="rsp-region-meta">
                    <div>
                      <dt>Recommended level</dt>
                      <dd>{region.recommendedCombatLevel}</dd>
                    </div>
                    <div>
                      <dt>Resource tier</dt>
                      <dd>{region.resourceTier}</dd>
                    </div>
                    <div>
                      <dt>Escape cost</dt>
                      <dd>{region.escape.cost} drachmae</dd>
                    </div>
                  </dl>
                  <p className="rsp-region-enemies">
                    Enemies: {region.enemyPool.map((enemyId) => ENEMY_DEFS_BY_ID[enemyId]?.name || enemyId).join(', ')}
                  </p>
                  <button
                    type="button"
                    className="rsp-btn rsp-btn-primary"
                    disabled={!available}
                    aria-describedby={!available ? reasonId : undefined}
                    onClick={() => handleEnterRegion(region.id)}
                  >
                    Enter {region.name}
                  </button>
                  {!available && (
                    <p id={reasonId} className="rsp-panel-note rsp-access-note" role="status">
                      {reason}
                    </p>
                  )}
                </li>
                )
              })}
            </ul>
          ) : (
            <div className="rsp-region-active">
              <p className="rsp-active-system-name">
                {activeRegion?.name || wilderness.regionId} expedition active
              </p>
              {!activeWildernessAccess?.available && (
                <p className="rsp-panel-note rsp-access-note" role="status">
                  This active expedition was retained after reload or travel. You can continue it or return safely to sanctuary.
                </p>
              )}
              <dl className="rsp-region-meta">
                <div>
                  <dt>Current risk</dt>
                  <dd>{wilderness.riskBand}</dd>
                </div>
                <div>
                  <dt>Steps taken</dt>
                  <dd>{wilderness.step}</dd>
                </div>
                <div>
                  <dt>Protected items</dt>
                  <dd>{protectedCount}</dd>
                </div>
              </dl>
              <p className="rsp-risk-warning" role="note">
                Defeat here may cost carried items beyond your {protectedCount} protected item allowance.
              </p>

              {pendingEnemy ? (
                <div className="rsp-encounter">
                  <p>
                    <strong>{pendingEnemy.name}</strong> blocks the path.
                  </p>
                  <p className="rsp-encounter-reward">
                    Reward preview: {pendingEnemy.loot.map((entry) => `${itemName(entry.itemId)} ×${entry.quantity}`).join(', ')},{' '}
                    {pendingEnemy.currency} drachmae
                  </p>
                  {onEngageEnemy ? (
                    <button type="button" className="rsp-btn rsp-btn-primary" onClick={handleEngage}>
                      Engage {pendingEnemy.name}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="rsp-btn rsp-btn-primary"
                        disabled
                        aria-describedby="rsp-engage-unavailable"
                      >
                        Engage {pendingEnemy.name}
                      </button>
                      <p id="rsp-engage-unavailable" className="rsp-panel-note">
                        Combat integration is unavailable right now.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <button type="button" className="rsp-btn rsp-btn-secondary" onClick={handleStep}>
                  Scout onward
                </button>
              )}

              <button type="button" className="rsp-btn rsp-btn-quiet" onClick={handleExit}>
                Return to sanctuary
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'crafting' && (
        <div id="rsp-tabpanel-crafting" role="tabpanel" aria-labelledby="rsp-tab-crafting" className="rsp-tabpanel">
          <p role="status" aria-live="polite" className="rsp-craft-status">
            {craftStatusMessage(crafting.lastResult)}
          </p>

          {!crafting.stationId ? (
            <ul className="rsp-station-list">
              {stationIds.map((stationId) => {
                const access = craftingAccessDecision(mapId, stationId)
                const available = access?.available === true
                const reasonId = `rsp-crafting-access-${stationId}`
                const reason = access?.reason || 'This station is unavailable from the current location.'
                return (
                <li key={stationId} className={available ? '' : 'is-unavailable'}>
                  <button
                    type="button"
                    className="rsp-btn rsp-btn-secondary"
                    data-station-id={stationId}
                    disabled={!available}
                    aria-describedby={!available ? reasonId : undefined}
                    onClick={() => handleOpenStation(stationId)}
                  >
                    {stationLabel(stationId)}
                  </button>
                  {!available && (
                    <p id={reasonId} className="rsp-panel-note rsp-access-note" role="status">
                      {reason}
                    </p>
                  )}
                </li>
                )
              })}
            </ul>
          ) : (
            <div className="rsp-station-active">
              <p className="rsp-station-name">{stationLabel(crafting.stationId)}</p>
              <label className="rsp-source-toggle">
                <input
                  type="checkbox"
                  aria-label="Use bank materials"
                  aria-describedby={!bankAvailable ? 'rsp-bank-source-unavailable' : 'rsp-bank-source-note'}
                  checked={useBankMaterials && bankAvailable}
                  disabled={!bankAvailable}
                  onChange={(event) => setUseBankMaterials(event.target.checked)}
                />
                <span>Use Storehouse materials</span>
              </label>
              <p id="rsp-bank-source-note" className="rsp-panel-note">
                Carried materials are used first; the Storehouse supplies only the exact remainder.
              </p>
              {!bankAvailable && (
                <p id="rsp-bank-source-unavailable" className="rsp-panel-note rsp-access-note">
                  Bank sourcing requires a physical bank beside this station.
                </p>
              )}
              {!activeCraftingAccess?.available && (
                <p id="rsp-active-station-access" className="rsp-panel-note rsp-access-note" role="status">
                  {activeCraftingAccess?.reason || 'This station is no longer reachable from the current location.'}
                </p>
              )}
              <ul className="rsp-recipe-list">
                {recipesAtStation.map((recipe) => {
                  const currentLevel = levelForXp(skills?.[recipe.skillId]?.xp || 0)
                  const check = quoteCraftingLedger({
                    inventory,
                    skills,
                    stationId: crafting.stationId,
                    sourceMode,
                  }, recipe.id, 1)
                  const physicallyAvailable = activeCraftingAccess?.available === true
                  const canUseRecipe = physicallyAvailable && check.ok
                  const reasonId = `rsp-craft-reason-${recipe.id}`
                  const describedBy = !physicallyAvailable ? 'rsp-active-station-access' : (!check.ok ? reasonId : undefined)
                  return (
                    <li key={recipe.id} className="rsp-recipe rsp-cut">
                      <strong>{recipe.name}</strong>
                      <p>
                        {skillName(recipe.skillId)} — requires level {recipe.level}, you are {currentLevel}. Grants{' '}
                        {recipe.xp} XP.
                      </p>
                      <p>
                        Ingredients:{' '}
                        {recipe.ingredients.map((entry) => `${itemName(entry.itemId)} ×${entry.quantity}`).join(', ')}
                      </p>
                      <p>
                        Produces: {recipe.outputs.map((entry) => `${itemName(entry.itemId)} ×${entry.quantity}`).join(', ')}
                      </p>
                      <button
                        type="button"
                        className="rsp-btn rsp-btn-primary"
                        disabled={!canUseRecipe}
                        aria-describedby={describedBy}
                        onClick={() => handleCraft(recipe.id)}
                      >
                        Craft
                      </button>
                      {physicallyAvailable && !check.ok && (
                        <p id={reasonId} className="rsp-panel-note">
                          {craftUnavailableReason(check)}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
              <button type="button" className="rsp-btn rsp-btn-quiet" onClick={handleCloseStation}>
                Leave station
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
