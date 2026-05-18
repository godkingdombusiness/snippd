// Low-lift Snippd graph seed.
// Paste into Neo4j Browser or run through cypher-shell after provisioning Aura.
// All relationships are structural so home feed reads stay cheap.

CREATE CONSTRAINT user_user_id IF NOT EXISTS FOR (u:User) REQUIRE u.user_id IS UNIQUE;
CREATE CONSTRAINT store_name IF NOT EXISTS FOR (s:Store) REQUIRE s.name IS UNIQUE;
CREATE CONSTRAINT category_name IF NOT EXISTS FOR (c:Category) REQUIRE c.name IS UNIQUE;
CREATE CONSTRAINT creator_handle IF NOT EXISTS FOR (c:Creator) REQUIRE c.handle IS UNIQUE;
CREATE CONSTRAINT flash_stack_id IF NOT EXISTS FOR (f:FlashStack) REQUIRE f.id IS UNIQUE;
CREATE CONSTRAINT food_stack_id IF NOT EXISTS FOR (f:FoodStack) REQUIRE f.id IS UNIQUE;
CREATE CONSTRAINT dietary_persona_name IF NOT EXISTS FOR (p:DietaryPersona) REQUIRE p.name IS UNIQUE;

MERGE (store:Store {name: "Dollar General"})
MERGE (category:Category {name: "household"})
MERGE (creator:Creator {handle: "@CouponQueen"})
MERGE (flash:FlashStack {id: "household_paper_dg"})
  SET flash.title = "Household Essentials Flash Stack",
      flash.total_cost = 11.50,
      flash.savings = 14.50,
      flash.category = "household",
      flash.storeName = "Dollar General",
      flash.creatorHandle = "@CouponQueen",
      flash.validRange = "Valid 5/18 - 5/23",
      flash.attributionLabel = "Curated by @CouponQueen · Valid 5/18 - 5/23"
MERGE (store)-[:OFFERS]->(flash)
MERGE (creator)-[:CURATED_BY]->(flash)
MERGE (flash)-[:IN_CATEGORY]->(category);

MERGE (hp:DietaryPersona {name: "High-Protein"})
MERGE (fb:DietaryPersona {name: "Family-Budget"})
MERGE (vg:DietaryPersona {name: "Vegetarian"})
MERGE (qe:DietaryPersona {name: "Quick-Easy"});

MERGE (creator:Creator {handle: "@CouponQueen"})
MERGE (protein:FoodStack {id: "high_protein_chicken_stack"})
  SET protein.title = "High-Protein Chicken Dinner Stack",
      protein.total_cost = 42.00,
      protein.total_meals_provided = 8,
      protein.savings = 14.50,
      protein.creatorHandle = "@CouponQueen",
      protein.validRange = "Valid 5/18 - 5/23",
      protein.attributionLabel = "Curated by @CouponQueen · Valid 5/18 - 5/23"
MERGE (creator)-[:CURATED_BY]->(protein)
MERGE (hp)-[:RECOMMENDS]->(protein);

MERGE (creator:Creator {handle: "@CouponQueen"})
MERGE (family:FoodStack {id: "family_budget_pasta_stack"})
  SET family.title = "Family-Budget Pasta Night Stack",
      family.total_cost = 34.00,
      family.total_meals_provided = 10,
      family.savings = 12.25,
      family.creatorHandle = "@CouponQueen",
      family.validRange = "Valid 5/18 - 5/23",
      family.attributionLabel = "Curated by @CouponQueen · Valid 5/18 - 5/23"
MERGE (creator)-[:CURATED_BY]->(family)
MERGE (fb)-[:RECOMMENDS]->(family);

MERGE (creator:Creator {handle: "@CouponQueen"})
MERGE (veg:FoodStack {id: "vegetarian_bean_bowl_stack"})
  SET veg.title = "Vegetarian Bean Bowl Stack",
      veg.total_cost = 29.00,
      veg.total_meals_provided = 8,
      veg.savings = 10.75,
      veg.creatorHandle = "@CouponQueen",
      veg.validRange = "Valid 5/18 - 5/23",
      veg.attributionLabel = "Curated by @CouponQueen · Valid 5/18 - 5/23"
MERGE (creator)-[:CURATED_BY]->(veg)
MERGE (vg)-[:RECOMMENDS]->(veg);

MERGE (creator:Creator {handle: "@CouponQueen"})
MERGE (quick:FoodStack {id: "quick_easy_taco_stack"})
  SET quick.title = "Quick-Easy Taco Stack",
      quick.total_cost = 31.00,
      quick.total_meals_provided = 6,
      quick.savings = 11.00,
      quick.creatorHandle = "@CouponQueen",
      quick.validRange = "Valid 5/18 - 5/23",
      quick.attributionLabel = "Curated by @CouponQueen · Valid 5/18 - 5/23"
MERGE (creator)-[:CURATED_BY]->(quick)
MERGE (qe)-[:RECOMMENDS]->(quick);

// Feed query: always excludes household essentials after 3 weekly skips.
// MATCH (u:User {user_id: $userId})
// MATCH (flash:FlashStack {id: "household_paper_dg"})
// WHERE NOT (u)-[:DISLIKES_CATEGORY]->(:Category {name: "household"})
// RETURN flash LIMIT 1;

// Persona query: static persona, budget guardrail, household volume floor.
// MATCH (u:User {user_id: $userId})-[:MATCHES_PERSONA]->(p:DietaryPersona)
// MATCH (p)-[:RECOMMENDS]->(f:FoodStack)
// WHERE f.total_cost <= u.weekly_budget
//   AND f.total_meals_provided >= u.household_meal_minimum
//   AND NOT (u)-[:AVOIDS]->(f)
// RETURN f LIMIT 1;

// Creator payout query: count direct redemptions on creator-curated stacks.
// MATCH (:Creator {handle: $handle})-[:CURATED_BY]->(f:FoodStack)<-[r:REDEEMED_STACK]-(:User)
// RETURN count(r) AS redemptions, sum(r.savings) AS attributed_savings;
