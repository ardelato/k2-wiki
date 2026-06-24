import { useLocalStorage } from '@vueuse/core'
import type { DriveStep, Driver } from 'driver.js'
import { nextTick } from 'vue'

import { getTourDemo } from '@/composables/plannerTourDemo'
import { t } from '@/i18n'
import { PLANNER_TERMS, type TermKey } from '@/utils/planner/plannerGlossary'

/**
 * Guided walkthrough for the Creature Planner, built on driver.js.
 *
 * One short intro (anchored to the objective selector) plus a dedicated step list
 * per objective. Step copy pulls term definitions from `plannerGlossary` so the
 * tour and the inline info-hints stay in sync.
 *
 * On an empty planner there'd be nothing to highlight, so before driving we ask the
 * mounted view (via `plannerTourDemo`) to seed a few sample creatures — the tour
 * then walks the real, live components and the seed is reverted when it ends. A step
 * whose anchor still isn't in the DOM (no demo for that objective, or not enough
 * sample creatures) is not dropped: it becomes a centered card that still explains
 * the feature.
 */
export type TourObjective = 'summon' | 'awaken-rush' | 'prestige-loop'

// Versioned key: bump the suffix to re-trigger the first-visit tour after a redesign.
const TOUR_SEEN_KEY = 'planner-tour-seen-v2'

/** Short glossary definition, for inlining into step copy. */
const def = (k: TermKey) => PLANNER_TERMS[k].short

// The one tour that's currently driving, if any. We track its teardown so the shell can
// end it on navigation/tab-change (driver.js isn't Vue-lifecycle-aware) using the same
// path as a user-initiated close.
let activeFinish: (() => void) | null = null

// Built lazily (inside startTour), not at module scope: the step copy calls t(), and
// t() must run when the tour starts so it picks up the user's current locale. A
// module-level const would freeze the strings to whatever locale was active at import.
function buildIntroStep(): DriveStep {
  return {
    element: '[data-tour="objective-selector"]',
    popover: {
      title: t('planner.tour.welcome.title'),
      description: t('planner.tour.welcome.body'),
      side: 'bottom',
      align: 'start',
    },
  }
}

// Drive Summon's Plan ⇄ All-materials toggle so a step can show the right view. The
// view-specific anchors (rail, focus) come first while we're in Plan; the toggle is
// present in both views, so we pre-switch to All-materials as that step settles
// (onHighlighted) — by the time the user advances, the materials list has rendered and
// its anchor resolves. Each step also asserts its own view so back-navigation recovers.
const summonView = (v: 'plan' | 'materials') => () => getTourDemo('summon')?.setView?.(v)

// Built lazily for the same reason as buildIntroStep: t() must run at tour-start so the
// step titles/bodies reflect the current locale rather than the import-time locale.
function buildSteps(): Record<TourObjective, DriveStep[]> {
  return {
    summon: [
      {
        element: '[data-tour="summon-header"]',
        onHighlightStarted: summonView('plan'),
        popover: {
          title: t('planner.tour.summonHeader.title'),
          description: t('planner.tour.summonHeader.body'),
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '[data-tour="summon-rail"]',
        onHighlightStarted: summonView('plan'),
        popover: {
          title: t('planner.tour.summonOrder.title'),
          description: t('planner.tour.summonOrder.body'),
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '[data-tour="summon-focus"]',
        onHighlightStarted: summonView('plan'),
        popover: {
          title: t('planner.tour.summonFocus.title'),
          description: t('planner.tour.summonFocus.body'),
          side: 'left',
          align: 'start',
        },
      },
      {
        element: '[data-tour="summon-views"]',
        onHighlightStarted: summonView('plan'),
        onHighlighted: summonView('materials'),
        popover: {
          title: t('planner.tour.summonViews.title'),
          description: t('planner.tour.summonViews.body'),
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '[data-tour="summon-materials"]',
        onHighlightStarted: summonView('materials'),
        popover: {
          title: t('planner.tour.summonMaterials.title'),
          description: t('planner.tour.summonMaterials.body'),
          side: 'top',
          align: 'start',
        },
      },
    ],
    'awaken-rush': [
      {
        element: '[data-tour="awaken-rail"]',
        popover: {
          title: t('planner.tour.awakenQueue.title'),
          description: t('planner.tour.awakenQueue.body'),
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '[data-tour="awaken-boosters"]',
        popover: {
          title: t('planner.tour.awakenBoosters.title'),
          description: t('planner.tour.awakenBoosters.body'),
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '[data-tour="awaken-strategy"]',
        popover: {
          title: t('planner.tour.awakenStrategy.title'),
          description: t('planner.tour.awakenStrategy.body'),
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '[data-tour="awaken-expeditions"]',
        popover: {
          title: t('planner.tour.awakenExpeditions.title'),
          description: t('planner.tour.awakenExpeditions.body'),
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '[data-tour="awaken-focus"]',
        popover: {
          title: t('planner.tour.awakenFocus.title'),
          description: t('planner.tour.awakenFocus.body'),
          side: 'left',
          align: 'start',
        },
      },
      {
        element: '[data-tour="awaken-views"]',
        popover: {
          title: t('planner.tour.awakenViews.title'),
          description: t('planner.tour.awakenViews.body'),
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '[data-tour="awaken-timeline"]',
        popover: {
          title: t('planner.tour.awakenTimeline.title'),
          description: t('planner.tour.awakenTimeline.body'),
          side: 'top',
          align: 'start',
        },
      },
      {
        element: '[data-tour="awaken-setup"]',
        popover: {
          title: t('planner.tour.awakenSetup.title'),
          description: t('planner.tour.awakenSetup.body'),
          side: 'bottom',
          align: 'end',
        },
      },
    ],
    'prestige-loop': [
      {
        element: '[data-tour="prestige-roster"]',
        popover: {
          title: t('planner.tour.loopRoster.title'),
          description: t('planner.tour.loopRoster.body', {
            anchor: PLANNER_TERMS.rosterRoleAnchor.term,
            booster: PLANNER_TERMS.rosterRoleBooster.term,
            climber: PLANNER_TERMS.rosterRoleClimber.term,
          }),
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '[data-tour="prestige-cadence"]',
        popover: {
          title: t('planner.tour.loopCadence.title'),
          description: t('planner.tour.loopCadence.body', { cadence: def('cadence') }),
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '[data-tour="prestige-expeditions"]',
        popover: {
          title: t('planner.tour.loopExpeditions.title'),
          description: t('planner.tour.loopExpeditions.body'),
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '[data-tour="prestige-hero"]',
        popover: {
          title: t('planner.tour.loopHero.title'),
          description: t('planner.tour.loopHero.body', { prestige: def('prestige') }),
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '[data-tour="prestige-tabs"]',
        popover: {
          title: t('planner.tour.loopTabs.title'),
          description: t('planner.tour.loopTabs.body', { levelChart: def('levelChart') }),
          side: 'bottom',
          align: 'start',
        },
      },
    ],
  }
}

/**
 * Build the steps driver.js runs. A step whose anchor is on the page highlights it
 * live; a step whose anchor is missing (no demo seeded for it) becomes a centered
 * card that keeps its copy — so the tour previews every feature instead of skipping
 * ahead.
 */
function prepareSteps(steps: DriveStep[]): DriveStep[] {
  return steps.map((step) => {
    const sel = typeof step.element === 'string' ? step.element : null
    const present = sel ? document.querySelector(sel) !== null : true
    return present ? step : { ...step, element: undefined }
  })
}

export function usePlannerTour() {
  const hasSeenTour = useLocalStorage<boolean>(TOUR_SEEN_KEY, false)

  async function startTour(objective: TourObjective, opts: { includeIntro?: boolean } = {}) {
    // Seed sample data so the live components render, then wait one tick for Vue to
    // flush the DOM before driver.js queries for the anchors. `nextTick` is microtask-
    // based, so (unlike requestAnimationFrame) it still resolves in a backgrounded tab.
    const demo = getTourDemo(objective)
    const seeded = demo ? demo.seed() : false
    if (seeded) await nextTick()

    const allSteps = buildSteps()
    const base = opts.includeIntro
      ? [buildIntroStep(), ...allSteps[objective]]
      : allSteps[objective]
    const steps = prepareSteps(base)
    if (steps.length === 0) {
      if (seeded) demo?.restore()
      return
    }

    // Lazy-load driver.js (+ its CSS) only when a tour actually runs — keeps the
    // ~96KB library out of the planner route chunk for the ~95% who never start it.
    const { driver } = await import('driver.js')
    await import('driver.js/dist/driver.css')

    // Restore + mark-seen runs from onDestroyStarted, which driver.js calls synchronously
    // for every close gesture (×, Esc, overlay, Done). We deliberately avoid onDestroyed:
    // it's gated on driver's active element, which driver sets inside a requestAnimationFrame
    // — so it can be skipped in a backgrounded tab. `finish` is idempotent and, because we
    // override onDestroyStarted, is responsible for actually tearing the overlay down.
    let d: Driver | null = null
    const finish = () => {
      if (activeFinish !== finish) return // already finished
      activeFinish = null
      hasSeenTour.value = true
      if (seeded) demo?.restore()
      d?.destroy() // g(false): removes the overlay without re-entering onDestroyStarted
    }

    try {
      d = driver({
        showProgress: true,
        allowClose: true,
        nextBtnText: t('planner.tour.nav.next'),
        prevBtnText: t('planner.tour.nav.back'),
        doneBtnText: t('planner.tour.nav.done'),
        popoverClass: 'planner-tour-popover',
        steps,
        onDestroyStarted: finish,
      })
      activeFinish = finish
      d.drive()
    } catch (err) {
      activeFinish = null
      if (seeded) demo?.restore()
      throw err
    }
  }

  // End an in-progress tour from outside (navigation / tab-change): driver.js's overlay
  // lives on document.body, not in Vue, so the shell calls this on unmount/tab-change —
  // otherwise the overlay orphans onto the next page and the demo data is never reverted.
  // It runs the same `finish` path as a user close, so it restores too.
  function stopTour() {
    activeFinish?.()
  }

  return { hasSeenTour, startTour, stopTour }
}
