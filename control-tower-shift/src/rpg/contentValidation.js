// Read-only integrity report for the complete Oathbearer content graph.
//
// This module never repairs or rewrites runtime registries. It inventories the
// canonical data, resolves cross-registry references, computes the obtainable
// crafting closure, and returns a deterministically sorted report suitable for
// tests and release tooling.

import { CAMPAIGN } from '../game/campaign.js'
import { createAuthoredDepthReport } from './authoringSchema.js'
import { ALL_ITEM_DEFS, RECIPES } from './crafting.js'
import { SHOP_DEFS } from './economy.js'
import { createInitialInventory, SKILL_DEF_BY_ID } from './progression.js'
import {
  REGISTERED_CONVERSATIONS,
  REGISTERED_ENCOUNTER_OWNER_QUEST,
  REGISTERED_ENCOUNTERS,
  REGISTERED_MAPS,
  REGISTERED_QUESTS,
} from './registry.js'
import { CRAFTING_ACCESS_BY_STATION } from './systemAccess.js'
import { ENEMY_DEFS } from './wilderness.js'

const ISSUE_SEVERITY = Object.freeze({ error: 0, warning: 1 })

function sortedIds(record) {
  return Object.keys(record || {}).sort((left, right) => left.localeCompare(right))
}

function finitePosition(entity) {
  return Number.isFinite(entity?.x) && Number.isFinite(entity?.y)
}

function issue(code, severity, path, reference, message) {
  return { code, severity, path, reference: reference ?? null, message }
}

function compareIssues(left, right) {
  return ISSUE_SEVERITY[left.severity] - ISSUE_SEVERITY[right.severity]
    || left.code.localeCompare(right.code)
    || left.path.localeCompare(right.path)
    || String(left.reference ?? '').localeCompare(String(right.reference ?? ''))
    || left.message.localeCompare(right.message)
}

function mapHasSpawn(map, spawnId) {
  if (!map || !spawnId) return false
  return Boolean(map.spawns?.[spawnId] || map.spawn?.id === spawnId)
}

function entityIndex() {
  const byId = new Map()
  const entries = []
  for (const mapId of sortedIds(REGISTERED_MAPS)) {
    const map = REGISTERED_MAPS[mapId]
    for (const entity of map.entities || []) {
      const entry = { mapId, entity }
      entries.push(entry)
      if (typeof entity?.id === 'string') {
        if (!byId.has(entity.id)) byId.set(entity.id, [])
        byId.get(entity.id).push(entry)
      }
    }
  }
  return { byId, entries }
}

function collectAuthoringRecords() {
  const records = []
  for (const questId of sortedIds(REGISTERED_QUESTS)) {
    const quest = REGISTERED_QUESTS[questId]
    records.push({ kind: 'quest', id: questId, path: `quests.${questId}`, value: quest })
    for (const [index, objective] of (quest.objectives || []).entries()) {
      const objectiveId = typeof objective?.id === 'string' ? objective.id : `objective-${index + 1}`
      records.push({
        kind: 'objective',
        id: `${questId}:${objectiveId}`,
        path: `quests.${questId}.objectives.${objectiveId}`,
        value: objective,
      })
    }
  }
  for (const conversationId of sortedIds(REGISTERED_CONVERSATIONS)) {
    records.push({
      kind: 'conversation',
      id: conversationId,
      path: `conversations.${conversationId}`,
      value: REGISTERED_CONVERSATIONS[conversationId],
    })
  }
  for (const mapId of sortedIds(REGISTERED_MAPS)) {
    const map = REGISTERED_MAPS[mapId]
    records.push({ kind: 'map', id: mapId, path: `maps.${mapId}`, value: map })
    for (const [index, entity] of (map.entities || []).entries()) {
      if (entity.kind === 'shop') continue // Merchant policy is authored once at SHOP_DEFS.
      const entityId = typeof entity?.id === 'string' ? entity.id : `entity-${index + 1}`
      const kind = entity.kind === 'resource' ? 'resource' : 'entity'
      records.push({
        kind,
        id: `${mapId}:${entityId}`,
        path: `maps.${mapId}.entities.${entityId}`,
        value: entity,
      })
    }
  }
  for (const encounterId of sortedIds(REGISTERED_ENCOUNTERS)) {
    records.push({
      kind: 'encounter',
      id: encounterId,
      path: `encounters.${encounterId}`,
      value: REGISTERED_ENCOUNTERS[encounterId],
    })
  }
  for (const shopId of sortedIds(SHOP_DEFS)) {
    records.push({ kind: 'merchant', id: shopId, path: `shops.${shopId}`, value: SHOP_DEFS[shopId] })
  }
  return records
}

function collectInventory() {
  const entities = entityIndex().entries
  const resources = entities
    .filter(({ entity }) => entity.kind === 'resource')
    .map(({ mapId, entity }) => ({
      id: `${mapId}:${entity.id}`,
      mapId,
      entityId: entity.id,
      itemId: entity.itemId,
      skillId: entity.skillId,
      level: entity.level ?? 1,
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
  const banks = entities
    .filter(({ entity }) => entity.kind === 'bank')
    .map(({ mapId, entity }) => ({ id: `${mapId}:${entity.id}`, mapId, entityId: entity.id }))
    .sort((left, right) => left.id.localeCompare(right.id))
  const shopPlacements = entities
    .filter(({ entity }) => entity.kind === 'shop')
    .map(({ mapId, entity }) => ({ id: `${mapId}:${entity.id}`, mapId, entityId: entity.id, shopId: entity.shopId }))
    .sort((left, right) => left.id.localeCompare(right.id))
  const stationPlacements = entities
    .filter(({ entity }) => ['station', 'crafting'].includes(entity.kind) || typeof entity.stationId === 'string')
    .map(({ mapId, entity }) => ({ id: `${mapId}:${entity.id}`, mapId, entityId: entity.id, stationId: entity.stationId }))
    .sort((left, right) => left.id.localeCompare(right.id))
  const stations = sortedIds(CRAFTING_ACCESS_BY_STATION)
  const inventory = {
    maps: sortedIds(REGISTERED_MAPS),
    quests: sortedIds(REGISTERED_QUESTS),
    conversations: sortedIds(REGISTERED_CONVERSATIONS),
    encounters: sortedIds(REGISTERED_ENCOUNTERS),
    items: sortedIds(ALL_ITEM_DEFS),
    recipes: RECIPES.map((recipe) => recipe.id).sort((left, right) => left.localeCompare(right)),
    resources,
    shops: sortedIds(SHOP_DEFS),
    shopPlacements,
    stations,
    stationPlacements,
    banks,
  }
  inventory.counts = {
    maps: inventory.maps.length,
    quests: inventory.quests.length,
    conversations: inventory.conversations.length,
    encounters: inventory.encounters.length,
    items: inventory.items.length,
    recipes: inventory.recipes.length,
    resources: inventory.resources.length,
    shops: inventory.shops.length,
    shopPlacements: inventory.shopPlacements.length,
    stations: inventory.stations.length,
    stationPlacements: inventory.stationPlacements.length,
    banks: inventory.banks.length,
  }
  return inventory
}

function validateMaps(issues, entities) {
  for (const mapId of sortedIds(REGISTERED_MAPS)) {
    const map = REGISTERED_MAPS[mapId]
    const path = `maps.${mapId}`
    for (const exit of [...(map.exits || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
      const exitPath = `${path}.exits.${exit.id || '<missing-id>'}`
      if (exit.toMapId && !REGISTERED_MAPS[exit.toMapId]) {
        issues.push(issue('UNRESOLVED_MAP', 'error', exitPath, exit.toMapId, 'Exit targets an unknown map.'))
      }
      if (exit.toMapId && exit.spawnId && REGISTERED_MAPS[exit.toMapId] && !mapHasSpawn(REGISTERED_MAPS[exit.toMapId], exit.spawnId)) {
        issues.push(issue('UNRESOLVED_SPAWN', 'error', exitPath, `${exit.toMapId}:${exit.spawnId}`, 'Exit targets an unknown destination spawn.'))
      }
      if (exit.encounterId && !REGISTERED_ENCOUNTERS[exit.encounterId]) {
        issues.push(issue('UNRESOLVED_ENCOUNTER', 'error', exitPath, exit.encounterId, 'Combat exit targets an unknown encounter.'))
      }
    }
    for (const entity of [...(map.entities || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
      const entityPath = `${path}.entities.${entity.id || '<missing-id>'}`
      const conversationIds = [entity.conversationId, ...(entity.optionalConversationIds || [])].filter(Boolean)
      for (const conversationId of conversationIds.sort((a, b) => a.localeCompare(b))) {
        if (!REGISTERED_CONVERSATIONS[conversationId]) {
          issues.push(issue('MISSING_CONVERSATION', 'error', entityPath, conversationId, 'Entity references a conversation absent from the canonical registry.'))
        }
      }
      if (entity.kind === 'resource') {
        if (!ALL_ITEM_DEFS[entity.itemId]) {
          issues.push(issue('UNRESOLVED_ITEM', 'error', entityPath, entity.itemId, 'Resource yields an unknown item.'))
        }
        if (!SKILL_DEF_BY_ID[entity.skillId]) {
          issues.push(issue('UNRESOLVED_SKILL', 'error', entityPath, entity.skillId, 'Resource trains an unknown skill.'))
        }
      }
      if (entity.kind === 'shop' && !SHOP_DEFS[entity.shopId]) {
        issues.push(issue('UNRESOLVED_SHOP', 'error', entityPath, entity.shopId, 'Placed merchant references an unknown shop definition.'))
      }
      if (entity.kind === 'bank' && (!entity.id || !finitePosition(entity))) {
        issues.push(issue('UNPLACED_BANK', 'error', entityPath, entity.id, 'Bank requires a stable id and finite world coordinates.'))
      }
    }
  }

  if (!entities.entries.some(({ entity }) => entity.kind === 'bank')) {
    issues.push(issue('UNPLACED_BANK', 'error', 'banks', null, 'No physical bank entity is registered.'))
  }
}

function validateQuests(issues, entities) {
  for (const questId of sortedIds(REGISTERED_QUESTS)) {
    const quest = REGISTERED_QUESTS[questId]
    const path = `quests.${questId}`
    for (const prerequisite of quest.prerequisites || []) {
      if (prerequisite?.kind === 'quest-complete' && !REGISTERED_QUESTS[prerequisite.questId]) {
        issues.push(issue('UNRESOLVED_QUEST', 'error', `${path}.prerequisites`, prerequisite.questId, 'Quest prerequisite references an unknown quest.'))
      }
    }
    for (const objective of quest.objectives || []) {
      const objectivePath = `${path}.objectives.${objective.id || '<missing-id>'}`
      if (objective.mapId && !REGISTERED_MAPS[objective.mapId]) {
        issues.push(issue('UNRESOLVED_MAP', 'error', objectivePath, objective.mapId, 'Quest objective references an unknown map.'))
      }
      if (objective.encounterId && !REGISTERED_ENCOUNTERS[objective.encounterId]) {
        issues.push(issue('UNRESOLVED_ENCOUNTER', 'error', objectivePath, objective.encounterId, 'Quest objective references an unknown encounter.'))
      }
      if (objective.conversationId && !REGISTERED_CONVERSATIONS[objective.conversationId]) {
        issues.push(issue('MISSING_CONVERSATION', 'error', objectivePath, objective.conversationId, 'Quest objective references a conversation absent from the canonical registry.'))
      }
      if (objective.npcId && !entities.byId.has(objective.npcId)) {
        issues.push(issue('UNRESOLVED_ENTITY', 'error', objectivePath, objective.npcId, 'Quest objective references an unknown NPC.'))
      }
      const authoredEntityId = typeof objective.entityId === 'string' ? objective.entityId : null
      if (authoredEntityId?.includes(':')) {
        const separator = authoredEntityId.indexOf(':')
        const mapId = authoredEntityId.slice(0, separator)
        const entityId = authoredEntityId.slice(separator + 1)
        const found = REGISTERED_MAPS[mapId]?.entities?.some((entity) => entity.id === entityId)
        if (!found) issues.push(issue('UNRESOLVED_ENTITY', 'error', objectivePath, authoredEntityId, 'Quest objective references an unknown qualified entity.'))
      }
    }
    for (const reward of quest.rewards || []) {
      if (reward?.kind === 'item' && !ALL_ITEM_DEFS[reward.itemId]) {
        issues.push(issue('UNRESOLVED_ITEM', 'error', `${path}.rewards`, reward.itemId, 'Quest reward references an unknown inventory item.'))
      }
    }
  }
}

function validateConversations(issues) {
  for (const conversationId of sortedIds(REGISTERED_CONVERSATIONS)) {
    const conversation = REGISTERED_CONVERSATIONS[conversationId]
    const path = `conversations.${conversationId}`
    if (!conversation.nodes?.[conversation.start]) {
      issues.push(issue('UNRESOLVED_CONVERSATION_NODE', 'error', path, conversation.start, 'Conversation start node is missing.'))
    }
    for (const nodeId of sortedIds(conversation.nodes)) {
      const node = conversation.nodes[nodeId]
      if (node.next && !conversation.nodes[node.next]) {
        issues.push(issue('UNRESOLVED_CONVERSATION_NODE', 'error', `${path}.nodes.${nodeId}`, node.next, 'Conversation next node is missing.'))
      }
      for (const choice of node.choices || []) {
        if (choice.next && !conversation.nodes[choice.next]) {
          issues.push(issue('UNRESOLVED_CONVERSATION_NODE', 'error', `${path}.nodes.${nodeId}.choices.${choice.id || '<missing-id>'}`, choice.next, 'Conversation choice targets a missing node.'))
        }
      }
    }
  }
}

function validateEncounters(issues) {
  const campaignIds = new Set(CAMPAIGN.map((level) => level.id))
  for (const encounterId of sortedIds(REGISTERED_ENCOUNTERS)) {
    const encounter = REGISTERED_ENCOUNTERS[encounterId]
    const path = `encounters.${encounterId}`
    for (const field of ['mapId', 'returnMapId', 'activationMapId']) {
      if (encounter[field] && !REGISTERED_MAPS[encounter[field]]) {
        issues.push(issue('UNRESOLVED_MAP', 'error', `${path}.${field}`, encounter[field], 'Encounter references an unknown map.'))
      }
    }
    if (encounter.returnSpawnId) {
      const mapId = encounter.returnMapId || encounter.mapId
      if (REGISTERED_MAPS[mapId] && !mapHasSpawn(REGISTERED_MAPS[mapId], encounter.returnSpawnId)) {
        issues.push(issue('UNRESOLVED_SPAWN', 'error', `${path}.returnSpawnId`, `${mapId}:${encounter.returnSpawnId}`, 'Encounter return spawn is unknown.'))
      }
    }
    const ownerQuestId = REGISTERED_ENCOUNTER_OWNER_QUEST[encounterId]
    if (!ownerQuestId || !REGISTERED_QUESTS[ownerQuestId]) {
      issues.push(issue('UNRESOLVED_QUEST', 'error', path, ownerQuestId, 'Encounter has no registered owning quest.'))
    }
    if (encounter.campaignLevelId && !campaignIds.has(encounter.campaignLevelId) && !(encounter.order || []).length) {
      issues.push(issue('UNRESOLVED_COMBAT_LEVEL', 'error', `${path}.campaignLevelId`, encounter.campaignLevelId, 'Encounter has neither a campaign level nor an authored combat order.'))
    }
  }
}

function validateItemsRecipesAndSources(issues, inventory) {
  for (const recipe of [...RECIPES].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const [kind, entries] of [['ingredients', recipe.ingredients], ['outputs', recipe.outputs]]) {
      for (const entry of entries || []) {
        if (!ALL_ITEM_DEFS[entry.itemId]) {
          issues.push(issue('UNRESOLVED_ITEM', 'error', `recipes.${recipe.id}.${kind}`, entry.itemId, `Recipe ${kind} reference an unknown item.`))
        }
      }
    }
    if (!SKILL_DEF_BY_ID[recipe.skillId]) {
      issues.push(issue('UNRESOLVED_SKILL', 'error', `recipes.${recipe.id}`, recipe.skillId, 'Recipe trains an unknown skill.'))
    }
  }

  for (const shopId of sortedIds(SHOP_DEFS)) {
    const shop = SHOP_DEFS[shopId]
    for (const mapId of [...(shop.mapIds || [])].sort((a, b) => a.localeCompare(b))) {
      if (!REGISTERED_MAPS[mapId]) {
        issues.push(issue('UNRESOLVED_MAP', 'error', `shops.${shopId}.mapIds`, mapId, 'Shop references an unknown map.'))
      }
    }
    for (const itemId of sortedIds(shop.listings)) {
      if (!ALL_ITEM_DEFS[itemId]) {
        issues.push(issue('UNRESOLVED_ITEM', 'error', `shops.${shopId}.listings`, itemId, 'Shop listing references an unknown item.'))
      }
    }
    if (!inventory.shopPlacements.some((placement) => placement.shopId === shopId && shop.mapIds?.includes(placement.mapId))) {
      issues.push(issue('UNPLACED_SHOP', 'error', `shops.${shopId}`, shopId, 'Shop definition has no matching physical merchant on an authored map.'))
    }
  }

  for (const stationId of inventory.stations) {
    const placement = CRAFTING_ACCESS_BY_STATION[stationId]
    for (const mapId of [...(placement?.mapIds || [])].sort((a, b) => a.localeCompare(b))) {
      if (!REGISTERED_MAPS[mapId]) {
        issues.push(issue('UNRESOLVED_MAP', 'error', `stations.${stationId}.mapIds`, mapId, 'Crafting station references an unknown map.'))
      }
    }
    if (!inventory.stationPlacements.some((entry) => entry.stationId === stationId && placement?.mapIds?.includes(entry.mapId))) {
      issues.push(issue('UNPLACED_STATION', 'warning', `stations.${stationId}`, stationId, 'Crafting access is map-gated but has no matching physical world entity.'))
    }
  }

  const obtainable = new Set()
  const initial = createInitialInventory()
  for (const entry of initial.slots || []) obtainable.add(entry.itemId)
  for (const itemId of Object.values(initial.equipment || {})) if (itemId) obtainable.add(itemId)
  for (const resource of inventory.resources) if (ALL_ITEM_DEFS[resource.itemId]) obtainable.add(resource.itemId)
  for (const shop of Object.values(SHOP_DEFS)) {
    for (const itemId of Object.keys(shop.listings || {})) if (ALL_ITEM_DEFS[itemId]) obtainable.add(itemId)
  }
  for (const enemy of Object.values(ENEMY_DEFS)) {
    for (const loot of enemy.loot || []) if (ALL_ITEM_DEFS[loot.itemId]) obtainable.add(loot.itemId)
  }
  for (const quest of Object.values(REGISTERED_QUESTS)) {
    for (const reward of quest.rewards || []) {
      if (reward?.kind === 'item' && ALL_ITEM_DEFS[reward.itemId]) obtainable.add(reward.itemId)
    }
  }

  let changed = true
  while (changed) {
    changed = false
    for (const recipe of RECIPES) {
      if (!(recipe.ingredients || []).every((entry) => obtainable.has(entry.itemId))) continue
      for (const output of recipe.outputs || []) {
        if (!obtainable.has(output.itemId)) {
          obtainable.add(output.itemId)
          changed = true
        }
      }
    }
  }

  for (const recipe of [...RECIPES].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const ingredient of recipe.ingredients || []) {
      if (!obtainable.has(ingredient.itemId)) {
        issues.push(issue('UNOBTAINABLE_RECIPE_INGREDIENT', 'error', `recipes.${recipe.id}.ingredients`, ingredient.itemId, 'No registered source or reachable recipe produces this ingredient.'))
      }
    }
  }

  const recipeInputs = new Set(RECIPES.flatMap((recipe) => (recipe.ingredients || []).map((entry) => entry.itemId)))
  const shopItems = new Set(Object.values(SHOP_DEFS).flatMap((shop) => Object.keys(shop.listings || {})))
  const craftedOutputs = new Set(RECIPES.flatMap((recipe) => (recipe.outputs || []).map((entry) => entry.itemId)))
  for (const itemId of [...craftedOutputs].sort((a, b) => a.localeCompare(b))) {
    const definition = ALL_ITEM_DEFS[itemId]
    const hasUse = recipeInputs.has(itemId)
      || shopItems.has(itemId)
      || Boolean(definition?.equipmentSlot)
      || Boolean(definition?.consumeEffect)
      || Boolean(definition?.useEffect)
      || Boolean(definition?.toolBonus)
    if (!hasUse) {
      issues.push(issue('INERT_CRAFTED_OUTPUT', 'warning', `items.${itemId}`, itemId, 'Crafted output has no recipe sink, shop listing, equipment slot, or use effect.'))
    }
  }
  return [...obtainable].sort((left, right) => left.localeCompare(right))
}

export function validateRPGContent() {
  const issues = []
  const inventory = collectInventory()
  const entities = entityIndex()
  validateMaps(issues, entities)
  validateQuests(issues, entities)
  validateConversations(issues)
  validateEncounters(issues)
  const obtainableItemIds = validateItemsRecipesAndSources(issues, inventory)
  const authoredDepth = createAuthoredDepthReport(collectAuthoringRecords())
  for (const record of authoredDepth.records) {
    if (record.status === 'release-ready') continue
    const missing = record.missingFields.length ? ` Missing: ${record.missingFields.join(', ')}.` : ''
    issues.push(issue(
      record.status === 'legacy' ? 'LEGACY_AUTHORING_RECORD' : 'INCOMPLETE_AUTHORING_RECORD',
      'warning',
      record.path,
      record.id,
      `${record.kind} is not release-ready under authoring schema v${authoredDepth.schemaVersion}.${missing}`,
    ))
  }
  issues.sort(compareIssues)

  const byCode = {}
  for (const entry of issues) byCode[entry.code] = (byCode[entry.code] || 0) + 1
  const sortedByCode = Object.fromEntries(Object.entries(byCode).sort(([left], [right]) => left.localeCompare(right)))
  return {
    inventory,
    obtainableItemIds,
    authoredDepth,
    issues,
    summary: {
      errors: issues.filter((entry) => entry.severity === 'error').length,
      warnings: issues.filter((entry) => entry.severity === 'warning').length,
      total: issues.length,
      byCode: sortedByCode,
    },
  }
}
