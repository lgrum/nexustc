import { getTableConfig } from "drizzle-orm/pg-core";
import { expect, test } from "vitest";

import {
  eterisPosting,
  eterisTransaction,
  eterisWallet,
  eterisWalletBalance,
  postRating,
  postRatingLikes,
  user,
  xpEvent,
  xpRewardBlock,
  xpRewardSubject,
} from "./app";

test("a recreated review receives a new identity", () => {
  expect(postRating.id.defaultFn?.()).not.toBe(postRating.id.defaultFn?.());
});

test("review likes belong to one stable review incarnation", () => {
  const ratingConfig = getTableConfig(postRating);
  const likesConfig = getTableConfig(postRatingLikes);

  expect(ratingConfig.columns.find(({ name }) => name === "id")).toMatchObject({
    isUnique: true,
    notNull: true,
  });
  expect(likesConfig.columns.map(({ name }) => name)).toEqual([
    "created_at",
    "email_verified_at_creation",
    "rating_id",
    "user_id",
  ]);
  expect(
    likesConfig.columns.find(
      ({ name }) => name === "email_verified_at_creation"
    )
  ).toMatchObject({ hasDefault: true, notNull: true });
  expect(
    likesConfig.primaryKeys.map(({ columns }) =>
      columns.map(({ name }) => name)
    )
  ).toContainEqual(["user_id", "rating_id"]);

  const ratingForeignKey = likesConfig.foreignKeys.find(
    (foreignKey) => foreignKey.reference().foreignTable === postRating
  );
  expect(ratingForeignKey?.reference().columns.map(({ name }) => name)).toEqual(
    ["rating_id"]
  );
  expect(
    ratingForeignKey?.reference().foreignColumns.map(({ name }) => name)
  ).toEqual(["id"]);
  expect(ratingForeignKey?.onDelete).toBe("cascade");
});

test("wallet balances and postings use signed 64-bit integers", () => {
  const walletConfig = getTableConfig(eterisWallet);
  const balanceConfig = getTableConfig(eterisWalletBalance);
  const transactionConfig = getTableConfig(eterisTransaction);
  const postingConfig = getTableConfig(eterisPosting);

  expect(
    balanceConfig.columns.find(({ name }) => name === "balance")?.getSQLType()
  ).toBe("bigint");
  expect(
    postingConfig.columns.find(({ name }) => name === "amount")?.getSQLType()
  ).toBe("bigint");
  expect(
    walletConfig.columns.find(({ name }) => name === "user_id")?.isUnique
  ).toBe(true);
  expect(
    transactionConfig.columns.find(({ name }) => name === "idempotency_key")
      ?.isUnique
  ).toBe(true);
  expect(
    transactionConfig.columns
      .find(({ name }) => name === "sequence")
      ?.getSQLType()
  ).toBe("bigserial");
  expect(
    postingConfig.primaryKeys.map(({ columns }) =>
      columns.map(({ name }) => name)
    )
  ).toContainEqual(["transaction_id", "wallet_id"]);
});

test("account deletion anonymizes wallets without deleting ledger postings", () => {
  const walletConfig = getTableConfig(eterisWallet);
  const postingConfig = getTableConfig(eterisPosting);

  expect(
    walletConfig.foreignKeys.find(
      (foreignKey) => foreignKey.reference().foreignTable === user
    )?.onDelete
  ).toBe("set null");
  expect(
    postingConfig.foreignKeys.find(
      (foreignKey) => foreignKey.reference().foreignTable === eterisWallet
    )?.onDelete
  ).toBe("restrict");
});

test("contribution reward subjects retain opaque review identities", () => {
  const subjectConfig = getTableConfig(xpRewardSubject);
  const blockConfig = getTableConfig(xpRewardBlock);
  const eventConfig = getTableConfig(xpEvent);

  expect(subjectConfig.foreignKeys).toHaveLength(1);
  expect(
    subjectConfig.foreignKeys[0]?.reference().columns.map(({ name }) => name)
  ).toEqual(["user_id"]);
  expect(subjectConfig.indexes.map(({ config }) => config.name)).toContain(
    "xp_reward_subject_kind_entity_unique"
  );
  expect(blockConfig.indexes.map(({ config }) => config.name)).toContain(
    "xp_reward_block_user_kind_scope_unique"
  );
  expect(
    eventConfig.foreignKeys.find(
      (foreignKey) => foreignKey.reference().foreignTable === xpRewardSubject
    )?.onDelete
  ).toBe("set null");
});
