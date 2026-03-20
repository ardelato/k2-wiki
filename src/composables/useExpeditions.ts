import { ref, computed, watch } from "vue";
import type { Creature, Expedition, Biome } from "@/types";
import expeditionsData from "@/data/expeditions.json";
import biomesData from "@/data/biomes.json";
import {
  calculateCreatureRating,
  calculateDifficultyRating,
  calculatePartyScore,
  calculateDuration,
  calculateExpeditionXp,
  estimateCompletionTime,
  xpForLevel,
  levelFromXp,
  getRecommendedCreatures,
  getLoopXpBonus,
  biomeMultiplier,
} from "@/utils/formulas";
import { useCreatureCollection } from "./useCreatureCollection";

const expeditions = ref<Expedition[]>(expeditionsData as Expedition[]);
const biomes = ref<Biome[]>(biomesData as Biome[]);

export function useExpeditions(creatures: Creature[]) {
  const searchQuery = ref("");
  const biomeFilter = ref<string | "all">("all");
  const selectedExpedition = ref<Expedition | null>(null);
  const selectedTier = ref(1);
  const partySlots = ref<(Creature | null)[]>([]);
  const activeSlotIndex = ref<number | null>(null);
  const creatureLevels = ref<Record<string, number>>({});
  const expeditionParties = ref<Record<string, (Creature | null)[]>>({});

  const filteredExpeditions = computed(() => {
    return expeditions.value
      .filter((exp) => {
        const matchesSearch =
          exp.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
          exp.biome.toLowerCase().includes(searchQuery.value.toLowerCase());
        const matchesBiome =
          biomeFilter.value === "all" || exp.biome === biomeFilter.value;
        return matchesSearch && matchesBiome;
      })
      .sort((a, b) => {
        const aNum = parseInt(a.id.replace(/\D/g, ""), 10) || 0;
        const bNum = parseInt(b.id.replace(/\D/g, ""), 10) || 0;
        return aNum - bNum;
      });
  });

  // Reset party slots when expedition changes
  watch(selectedExpedition, (exp) => {
    if (!exp) {
      partySlots.value = [];
      activeSlotIndex.value = null;
      return;
    }

    // create party if it doesn't exist
    if (!expeditionParties.value[exp.id]) {
      expeditionParties.value[exp.id] = Array(exp.maxPartySize).fill(null);
    }

    // load it
    partySlots.value = expeditionParties.value[exp.id];
    activeSlotIndex.value = null;
  });

  watch(
    partySlots,
    (slots) => {
      if (!selectedExpedition.value) return;
      expeditionParties.value[selectedExpedition.value.id] = [...slots];
    },
    { deep: true },
  );

  const getBiome = (id: string): Biome | undefined => {
    return biomes.value.find((b) => b.id === id);
  };

  const currentBiome = computed(() => {
    if (!selectedExpedition.value) return undefined;
    return getBiome(selectedExpedition.value.biome);
  });

  const recommendedCreatures = computed(() => {
    if (!selectedExpedition.value) return [];
    const expedition = selectedExpedition.value;
    const biome = currentBiome.value;
    const remainingScore = difficultyRating.value - partyScore.value;
    const base = getRecommendedCreatures(
      creatures.filter(
        (c) =>
          !allAssignedCreatureIds.value.has(c.id) &&
          !excludedCreatureIds.value.has(c.id),
      ),
      expedition,
      creatureLevels.value,
      biome,
    );
    return base.map((entry) => {
      let weightedStatSum = 0;
      for (const [stat, weight] of Object.entries(expedition.statWeights) as [
        keyof typeof entry.creature.stats,
        number,
      ][]) {
        if (weight > 0) {
          weightedStatSum += entry.creature.stats[stat] * weight;
        }
      }
      let suggestedLevel: number | null = null;
      if (weightedStatSum > 0) {
        const biomeMult = biome ? biomeMultiplier(entry.creature, biome) : 1.0;
        const traitBonus =
          entry.creature.trait === expedition.trait ? 1.5 : 1.0;
        const ratingPerLevel = weightedStatSum * biomeMult * traitBonus;
        suggestedLevel = Math.max(
          1,
          Math.min(120, Math.ceil(remainingScore / ratingPerLevel)),
        );
      }
      return { ...entry, suggestedLevel };
    });
  });

  const difficultyRating = computed(() => {
    if (!selectedExpedition.value) return 0;
    return calculateDifficultyRating(
      selectedExpedition.value,
      selectedTier.value,
    );
  });

  const partyScore = computed(() => {
    if (!selectedExpedition.value) return 0;
    return calculatePartyScore(
      partySlots.value,
      selectedExpedition.value,
      creatureLevels.value,
      currentBiome.value,
    );
  });

  const estimatedDuration = computed(() => {
    if (!selectedExpedition.value || partyScore.value <= 0) return null;
    return calculateDuration(
      partyScore.value,
      selectedExpedition.value,
      selectedTier.value,
    );
  });

  const estimatedDurationMinutes = computed(() => {
    if (!selectedExpedition.value || partyScore.value <= 0) return null;
    return estimateCompletionTime(
      partyScore.value,
      selectedExpedition.value,
      selectedTier.value,
    );
  });

  const scoreRatio = computed(() => {
    if (difficultyRating.value <= 0 || partyScore.value <= 0) return null;
    return partyScore.value / difficultyRating.value;
  });

  const loopCount = ref(0);

  const loopBonusPercent = computed(() => {
    return Math.round(getLoopXpBonus(loopCount.value) * 100);
  });

  const totalXp = computed(() => {
    if (!selectedExpedition.value) return null;
    const activeCreatures = partySlots.value.filter(Boolean).length;
    if (activeCreatures <= 0) return null;
    return calculateExpeditionXp(
      selectedExpedition.value,
      selectedTier.value,
      loopCount.value,
      activeCreatures,
    );
  });

  const xpPerMinute = computed(() => {
    if (
      !totalXp.value ||
      !estimatedDuration.value ||
      estimatedDuration.value <= 0
    )
      return null;
    return Math.round(totalXp.value / (estimatedDuration.value / 60));
  });

  const levelsGained = computed(() => {
    if (!totalXp.value) return null;
    const startXp = xpForLevel(1);
    const endLevel = Math.min(120, levelFromXp(startXp + totalXp.value));
    return endLevel - 1;
  });

  const partyXpProgress = computed(() => {
    if (!totalXp.value) return [];
    return partySlots.value
      .filter((c): c is Creature => c !== null)
      .map((creature) => {
        const currentLevel = creatureLevels.value[creature.id] || 1;
        const startXp = xpForLevel(currentLevel);
        const endXp = startXp + totalXp.value!;
        const endLevel = Math.min(120, levelFromXp(endXp));
        const targetLevel = Math.min(120, endLevel + 1);
        const xpIntoLevel = endXp - xpForLevel(endLevel);
        const xpNeeded = xpForLevel(targetLevel) - xpForLevel(endLevel);
        const progress = xpNeeded > 0 ? xpIntoLevel / xpNeeded : 0;
        return {
          creature,
          currentLevel,
          targetLevel: endLevel >= 120 ? 120 : targetLevel,
          progress: endLevel >= 120 ? 1 : Math.min(1, progress),
        };
      });
  });

  const assignCreatureToSlot = (creature: Creature) => {
    const slots = partySlots.value;
    // If there's an active slot, fill it
    if (
      activeSlotIndex.value !== null &&
      activeSlotIndex.value < slots.length &&
      !slots[activeSlotIndex.value]
    ) {
      slots[activeSlotIndex.value] = creature;
      activeSlotIndex.value = null;
      return;
    }
    // Otherwise fill first empty slot
    const emptyIndex = slots.findIndex((s) => s === null);
    if (emptyIndex !== -1) {
      slots[emptyIndex] = creature;
      activeSlotIndex.value = null;
    }
  };

  const removeCreatureFromSlot = (index: number) => {
    if (index >= 0 && index < partySlots.value.length) {
      partySlots.value[index] = null;
    }
  };

  const setActiveSlot = (index: number) => {
    if (activeSlotIndex.value === index) {
      activeSlotIndex.value = null;
    } else {
      activeSlotIndex.value = index;
    }
  };

  const getCreatureSlotRating = (creature: Creature) => {
    if (!selectedExpedition.value) return 0;
    const level = creatureLevels.value[creature.id] || 1;
    return calculateCreatureRating(
      creature,
      selectedExpedition.value,
      level,
      currentBiome.value,
    );
  };

  const updateCreatureLevel = (creatureId: string, level: number) => {
    creatureLevels.value[creatureId] = Math.max(1, Math.min(120, level));
  };

  const uniqueBiomes = computed(() => {
    const ids = new Set(expeditions.value.map((e) => e.biome));
    return Array.from(ids).sort();
  });

  function resetAllExpeditions() {
    // clear all saved parties
    expeditionParties.value = {};

    // reset current view
    if (selectedExpedition.value) {
      partySlots.value = Array(selectedExpedition.value.maxPartySize).fill(
        null,
      );
    } else {
      partySlots.value = [];
    }

    activeSlotIndex.value = null;
  }

  function evaluateExpedition(exp: Expedition) {
    const party = expeditionParties.value[exp.id];
    if (!party || party.every((c) => c === null)) return null;

    const biome = getBiome(exp.biome);

    // try tiers from highest → lowest
    const maxTier = 10; // adjust if needed
    let bestTier = 1;

    for (let tier = maxTier; tier >= 1; tier--) {
      const difficulty = calculateDifficultyRating(exp, tier);

      const score = calculatePartyScore(
        party,
        exp,
        creatureLevels.value,
        biome,
      );

      if (score >= difficulty) {
        bestTier = tier;
        break;
      }
    }

    const activeCreatures = party.filter(Boolean).length;
    if (activeCreatures === 0) return null;

    const xp = calculateExpeditionXp(exp, bestTier, 0, activeCreatures);

    const duration = calculateDuration(
      calculatePartyScore(party, exp, creatureLevels.value, biome),
      exp,
      bestTier,
    );

    if (!xp || !duration || duration <= 0) return null;

    const xpPerSecond = (xp / duration) * activeCreatures;

    return {
      expeditionId: exp.id,
      tier: bestTier,
      xp,
      duration,
      xpPerSecond,
    };
  }

  const totalXpPerSecond = computed(() => {
    let total = 0;

    for (const exp of expeditions.value) {
      const result = evaluateExpedition(exp);
      if (result) {
        total += result.xpPerSecond;
      }
    }

    return Math.round(total * 100) / 100;
  });

  function exportSetup() {
    const data = {
      parties: Object.fromEntries(
        Object.entries(expeditionParties.value).map(([expId, party]) => [
          expId,
          party.map((c) => (c ? c.id : null)),
        ]),
      ),
      levels: creatureLevels.value,
    };

    return JSON.stringify(data);
  }

  function importSetup(json: string) {
    try {
      const parsed = JSON.parse(json);

      if (!parsed.parties) return false;

      // rebuild parties using creature IDs → objects
      const newParties: Record<string, (Creature | null)[]> = {};

      for (const [expId, partyIds] of Object.entries(parsed.parties)) {
        if (!Array.isArray(partyIds)) continue;

        newParties[expId] = partyIds.map((id) =>
          id ? creatures.find((c) => c.id === id) || null : null,
        );
      }

      expeditionParties.value = newParties;

      if (parsed.levels) {
        creatureLevels.value = parsed.levels;
      }

      // refresh current expedition view
      if (selectedExpedition.value) {
        const expId = selectedExpedition.value.id;
        partySlots.value =
          expeditionParties.value[expId] ||
          Array(selectedExpedition.value.maxPartySize).fill(null);
      }

      return true;
    } catch (e) {
      console.error("Import failed", e);
      return false;
    }
  }

  function getRecommendedMap() {
    const map: Record<string, ReturnType<typeof getRecommendedCreatures>> = {};

    for (const exp of expeditions.value) {
      const biome = getBiome(exp.biome);

      map[exp.id] = getRecommendedCreatures(
        creatures,
        exp,
        creatureLevels.value,
        biome,
      );
    }

    return map;
  }
  const { isOwned } = useCreatureCollection();
  const excludedExpeditionIds = ["sanctuary-0", "helpers-0"];

  const excludedCreatureIds = computed<Set<string>>(() => {
    const ids = new Set<string>();

    // example logic: collect from locked expeditions
    for (const expId of excludedExpeditionIds) {
      const party = expeditionParties.value[expId] || [];
      for (const c of party) {
        if (c) ids.add(c.id);
      }
    }

    return ids;
  });

  function autoAssignBestXp() {
    const prevParties = expeditionParties.value;

    expeditionParties.value = {};

    // restore excluded ones
    for (const expId of excludedExpeditionIds) {
      expeditionParties.value[expId] = prevParties[expId] || [];
    }
    const assigned = new Set<string>();
    const recMap = getRecommendedMap();

    // Initialize empty parties
    for (const exp of expeditions.value) {
      if (excludedExpeditionIds.includes(exp.id)) continue;

      expeditionParties.value[exp.id] = Array(exp.maxPartySize).fill(null);
    }

    // Sort expeditions by descending difficulty (hardest first)
    const sortedExps = [...expeditions.value].sort((a, b) => {
      return calculateDifficultyRating(b, 5) - calculateDifficultyRating(a, 5);
    });

    const assignedGlobal = allAssignedCreatureIds.value;

    for (const exp of sortedExps) {
      const maxParty = exp.maxPartySize;
      let bestParty: Creature[] | null = null;
      let bestScoreRatio = 0;

      // Try tiers from highest (5) to lowest (1)
      for (let tier = 5; tier >= 1; tier--) {
        const party: Creature[] = [];
        const recs = (recMap[exp.id] || [])
          .filter(
            (r) =>
              isOwned(r.creature.id) &&
              !assigned.has(r.creature.id) &&
              !assignedGlobal.has(r.creature.id) &&
              !excludedCreatureIds.value.has(r.creature.id),
          )
          .sort((a, b) => b.rating - a.rating); // high score first

        for (const entry of recs) {
          if (party.length >= maxParty) break;
          party.push(entry.creature);
        }

        if (party.length === 0) continue;

        const ratio =
          calculatePartyScore(
            party,
            exp,
            creatureLevels.value,
            getBiome(exp.biome),
          ) / calculateDifficultyRating(exp, tier);

        const TOLERANCE = 0.95;

        // Prefer closest ratio slightly above 1, otherwise acceptable slightly under 1
        if (ratio >= 1 && (bestScoreRatio < 1 || ratio < bestScoreRatio)) {
          bestParty = [...party];
          bestScoreRatio = ratio;
        } else if (ratio >= TOLERANCE && ratio < 1 && ratio > bestScoreRatio) {
          bestParty = [...party];
          bestScoreRatio = ratio;
        }
      }

      // Assign party if we have any valid combination
      if (bestParty && bestParty.length > 0) {
        expeditionParties.value[exp.id] = bestParty;
        bestParty.forEach((c) => assigned.add(c.id));
      }
    }

    // Update currently selected expedition in UI
    if (selectedExpedition.value) {
      partySlots.value = expeditionParties.value[selectedExpedition.value.id];
    }
  }

  const allAssignedCreatureIds = computed(() => {
    const ids = new Set<string>();

    for (const party of Object.values(expeditionParties.value)) {
      for (const c of party || []) {
        if (c) ids.add(c.id);
      }
    }

    return ids;
  });

  return {
    expeditions,
    filteredExpeditions,
    biomes,
    searchQuery,
    biomeFilter,
    selectedExpedition,
    selectedTier,
    partySlots,
    activeSlotIndex,
    creatureLevels,
    recommendedCreatures,
    difficultyRating,
    partyScore,
    estimatedDuration,
    estimatedDurationMinutes,
    scoreRatio,
    loopCount,
    loopBonusPercent,
    totalXp,
    xpPerMinute,
    levelsGained,
    partyXpProgress,
    currentBiome,
    totalXpPerSecond,
    getBiome,
    assignCreatureToSlot,
    removeCreatureFromSlot,
    setActiveSlot,
    getCreatureSlotRating,
    updateCreatureLevel,
    uniqueBiomes,
    resetAllExpeditions,
    exportSetup,
    importSetup,
    autoAssignBestXp,
    excludedCreatureIds,
  };
}
