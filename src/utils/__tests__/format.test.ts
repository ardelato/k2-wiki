import { formatChance, formatDuration, sourceLabel, toTitleCase } from '@/utils/format'

describe('formatDuration', () => {
  test('zero seconds', () => {
    expect(formatDuration(0)).toBe('0s')
  })

  test('negative input clamps to 0', () => {
    expect(formatDuration(-10)).toBe('0s')
  })

  test('rounds fractional seconds', () => {
    expect(formatDuration(1.6)).toBe('2s')
  })

  test('59 seconds stays in seconds', () => {
    expect(formatDuration(59)).toBe('59s')
  })

  test('exactly 60 seconds returns 1m', () => {
    expect(formatDuration(60)).toBe('1m')
  })

  test('90 seconds returns 1m 30s', () => {
    expect(formatDuration(90)).toBe('1m 30s')
  })

  test('exactly 1 hour', () => {
    expect(formatDuration(3600)).toBe('1h')
  })

  test('1 hour 30 minutes — seconds omitted when hours present', () => {
    expect(formatDuration(3600 + 1800 + 45)).toBe('1h 30m')
  })

  test('seconds omitted when hours present even without days', () => {
    expect(formatDuration(3600 + 60 + 30)).toBe('1h 1m')
  })

  test('exactly 1 day', () => {
    expect(formatDuration(86400)).toBe('1d')
  })

  test('1 day 2 hours 3 minutes — no seconds emitted', () => {
    expect(formatDuration(86400 + 7200 + 180 + 45)).toBe('1d 2h 3m')
  })

  test('2 days no hours no minutes', () => {
    expect(formatDuration(2 * 86400)).toBe('2d')
  })

  test('minutes shown even when zero if no larger unit', () => {
    // exactly 120s → 2m
    expect(formatDuration(120)).toBe('2m')
  })

  test('days with hours but no minutes', () => {
    expect(formatDuration(86400 + 3600)).toBe('1d 1h')
  })
})

describe('sourceLabel', () => {
  test('crafting_ prefix is stripped and title-cased', () => {
    expect(sourceLabel('crafting_iron_sword')).toBe('Iron Sword')
  })

  test('crafting_ with single word', () => {
    expect(sourceLabel('crafting_leather')).toBe('Leather')
  })

  test('expedition_ prefix returns Expedition', () => {
    expect(sourceLabel('expedition_forest')).toBe('Expedition')
  })

  test('"completing expeditions" returns Expedition', () => {
    expect(sourceLabel('completing expeditions')).toBe('Expedition')
  })

  test('plain source is title-cased', () => {
    expect(sourceLabel('monster drop')).toBe('Monster Drop')
  })

  test('already title-cased source is preserved', () => {
    expect(sourceLabel('Market')).toBe('Market')
  })
})

describe('formatChance', () => {
  test('exactly 1 returns "100%"', () => {
    expect(formatChance(1)).toBe('100%')
  })

  test('0.5 returns "50.0%"', () => {
    expect(formatChance(0.5)).toBe('50.0%')
  })

  test('0.25 returns "25.0%"', () => {
    expect(formatChance(0.25)).toBe('25.0%')
  })

  test('very small chance (< 0.01) uses 2 decimal places', () => {
    expect(formatChance(0.005)).toBe('0.50%')
  })

  test('exactly 0.01 uses 1 decimal place', () => {
    expect(formatChance(0.01)).toBe('1.0%')
  })

  test('greater than 1 returns 2x format', () => {
    expect(formatChance(1.5)).toBe('2x 50.0%')
  })

  test('just above 1 with small extra uses 2 decimal places', () => {
    expect(formatChance(1.005)).toBe('2x 0.50%')
  })

  test('exactly 0 returns "0.00%" (< 0.01 threshold uses 2 decimals)', () => {
    expect(formatChance(0)).toBe('0.00%')
  })
})

describe('toTitleCase', () => {
  test('single word', () => {
    expect(toTitleCase('hello')).toBe('Hello')
  })

  test('multiple words', () => {
    expect(toTitleCase('hello world')).toBe('Hello World')
  })

  test('underscore-separated words', () => {
    expect(toTitleCase('iron_sword')).toBe('Iron Sword')
  })

  test('hyphen-separated words', () => {
    expect(toTitleCase('fire-drake')).toBe('Fire Drake')
  })

  test('mixed separators', () => {
    expect(toTitleCase('iron_fire-drake')).toBe('Iron Fire Drake')
  })

  test('ALL CAPS input lowercases non-first letters', () => {
    expect(toTitleCase('HELLO WORLD')).toBe('Hello World')
  })

  test('extra whitespace is trimmed and collapsed', () => {
    expect(toTitleCase('  hello   world  ')).toBe('Hello World')
  })

  test('empty string returns empty string', () => {
    expect(toTitleCase('')).toBe('')
  })

  test('whitespace-only string returns empty string', () => {
    expect(toTitleCase('   ')).toBe('')
  })

  test('consecutive separators treated as one', () => {
    expect(toTitleCase('a__b--c')).toBe('A B C')
  })
})
