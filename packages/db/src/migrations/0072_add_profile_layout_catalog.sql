INSERT INTO "profile_catalog_item" (
	"id", "stable_key", "kind", "lifecycle", "is_protected_default", "created_at", "updated_at"
) VALUES
	('profile-layout-grid', 'layout.grid', 'layout', 'active', false, now(), now()),
	('profile-layout-spotlight', 'layout.spotlight', 'layout', 'active', false, now(), now());
--> statement-breakpoint
INSERT INTO "profile_catalog_item_revision" (
	"id", "item_id", "revision", "state", "name", "description", "is_free",
	"required_tier", "catalog_order", "published_at", "created_at", "updated_at"
) VALUES
	(
		'profile-layout-grid-r1', 'profile-layout-grid', 1, 'published',
		U&'Cuadr\00edcula', U&'Dos columnas en pantallas amplias y una secuencia en m\00f3vil.', false,
		'level1', 1, now(), now(), now()
	),
	(
		'profile-layout-spotlight-r1', 'profile-layout-spotlight', 1, 'published',
		'Foco', U&'Destaca el primer Showcase disponible y ordena el resto en cuadr\00edcula.', false,
		'level5', 2, now(), now(), now()
	);
--> statement-breakpoint
INSERT INTO "profile_catalog_layout_revision" ("revision_id", "renderer_key")
VALUES
	('profile-layout-grid-r1', 'grid'),
	('profile-layout-spotlight-r1', 'spotlight');
--> statement-breakpoint
UPDATE "profile_catalog_item"
SET "current_published_revision_id" = 'profile-layout-grid-r1', "updated_at" = now()
WHERE "id" = 'profile-layout-grid';
--> statement-breakpoint
UPDATE "profile_catalog_item"
SET "current_published_revision_id" = 'profile-layout-spotlight-r1', "updated_at" = now()
WHERE "id" = 'profile-layout-spotlight';
