/**
 * Behavioral Intelligence SQL Migration Validation
 * Tests that the migration file contains the correct schema
 */

import fs from 'fs';
import path from 'path';

describe('SQL Migration: 001_behavioral_intelligence.sql', () => {
  let migrationContent: string;

  beforeAll(() => {
    const migrationPath = path.join(
      __dirname,
      '../supabase/migrations/001_behavioral_intelligence.sql'
    );
    migrationContent = fs.readFileSync(migrationPath, 'utf-8');
  });

  test('migration file exists', () => {
    expect(migrationContent).toBeDefined();
    expect(migrationContent.length).toBeGreaterThan(100);
  });

  test('migration creates event_stream table', () => {
    expect(migrationContent).toContain('CREATE TABLE public.event_stream');
    expect(migrationContent).toContain('user_id uuid REFERENCES auth.users NOT NULL');
    expect(migrationContent).toContain('event_name text NOT NULL');
    expect(migrationContent).toContain('session_id uuid NOT NULL');
  });

  test('event_stream has required columns', () => {
    const requiredColumns = [
      'id uuid PRIMARY KEY',
      'user_id uuid',
      'household_id uuid',
      'session_id uuid',
      'event_name text',
      'timestamp timestamptz',
      'screen_name text',
      'object_type text',
      'object_id uuid',
      'retailer_key text',
      'category text',
      'brand text',
      'rank_position int',
      'model_version text',
      'explanation_shown boolean',
      'metadata jsonb',
      'context jsonb',
    ];

    requiredColumns.forEach((col) => {
      expect(migrationContent).toContain(col);
    });
  });

  test('migration creates recommendation_exposures table', () => {
    expect(migrationContent).toContain('CREATE TABLE public.recommendation_exposures');
    expect(migrationContent).toContain('recommendation_type text NOT NULL');
    expect(migrationContent).toContain('outcome_status text DEFAULT');
  });

  test('recommendation_exposures has outcome tracking columns', () => {
    const trackingColumns = ['shown_at', 'clicked_at', 'accepted_at', 'dismissed_at'];
    trackingColumns.forEach((col) => {
      expect(migrationContent).toContain(col);
    });
  });

  test('migration creates model_predictions table', () => {
    expect(migrationContent).toContain('CREATE TABLE public.model_predictions');
    expect(migrationContent).toContain('prediction_type text NOT NULL');
    expect(migrationContent).toContain('score numeric NOT NULL');
    expect(migrationContent).toContain('model_version text NOT NULL');
  });

  test('migration creates wealth_momentum_snapshots table', () => {
    expect(migrationContent).toContain('CREATE TABLE public.wealth_momentum_snapshots');
    expect(migrationContent).toContain('realized_savings numeric(12,2)');
    expect(migrationContent).toContain('inflation_offset numeric(12,2)');
    expect(migrationContent).toContain('waste_reduction_score numeric(5,2)');
    expect(migrationContent).toContain('velocity_score numeric(5,2)');
    expect(migrationContent).toContain('projected_annual_wealth numeric(12,2)');
  });

  test('migration creates performance indexes', () => {
    expect(migrationContent).toContain('CREATE INDEX idx_es_user_time');
    expect(migrationContent).toContain('event_stream(user_id, timestamp DESC)');
    expect(migrationContent).toContain('CREATE INDEX idx_wealth_user_time');
    expect(migrationContent).toContain('wealth_momentum_snapshots(user_id, timestamp DESC)');
  });
});
