import type { CollationOptions, TransactionOptions } from 'mongodb'
import type { MongoMemoryReplSet } from 'mongodb-memory-server'
import type { ClientSession, ConnectOptions, Connection } from 'mongoose'
import type { BaseDatabaseAdapter, DatabaseAdapterObj, Payload } from 'payload'

import fs from 'fs'
import mongoose from 'mongoose'
import path from 'path'
import { createDatabaseAdapter } from 'payload'

import type { CollectionModel, GlobalModel } from './types.js'

import { connect } from './connect.js'
import { count } from './count.js'
import { create } from './create.js'
import { createGlobal } from './createGlobal.js'
import { createGlobalVersion } from './createGlobalVersion.js'
import { createMigration } from './createMigration.js'
import { createVersion } from './createVersion.js'
import { deleteMany } from './deleteMany.js'
import { deleteOne } from './deleteOne.js'
import { deleteVersions } from './deleteVersions.js'
import { destroy } from './destroy.js'
import { find } from './find.js'
import { findGlobal } from './findGlobal.js'
import { findGlobalVersions } from './findGlobalVersions.js'
import { findOne } from './findOne.js'
import { findVersions } from './findVersions.js'
import { init } from './init.js'
import { migrateFresh } from './migrateFresh.js'
import { queryDrafts } from './queryDrafts.js'
import { beginTransaction } from './transactions/beginTransaction.js'
import { commitTransaction } from './transactions/commitTransaction.js'
import { rollbackTransaction } from './transactions/rollbackTransaction.js'
import { updateGlobal } from './updateGlobal.js'
import { updateGlobalVersion } from './updateGlobalVersion.js'
import { updateOne } from './updateOne.js'
import { updateVersion } from './updateVersion.js'

export type { MigrateDownArgs, MigrateUpArgs } from './types.js'

export interface Args {
  /** Set to false to disable auto-pluralization of collection names, Defaults to true */
  autoPluralization?: boolean
  /**
   * If enabled, collation allows for language-specific rules for string comparison.
   * This configuration can include the following options:
   *
   * - `strength` (number): Comparison level (1: Primary, 2: Secondary, 3: Tertiary (default), 4: Quaternary, 5: Identical)
   * - `caseLevel` (boolean): Include case comparison at strength level 1 or 2.
   * - `caseFirst` (string): Sort order of case differences during tertiary level comparisons ("upper", "lower", "off").
   * - `numericOrdering` (boolean): Compare numeric strings as numbers.
   * - `alternate` (string): Consider whitespace and punctuation as base characters ("non-ignorable", "shifted").
   * - `maxVariable` (string): Characters considered ignorable when `alternate` is "shifted" ("punct", "space").
   * - `backwards` (boolean): Sort strings with diacritics from back of the string.
   * - `normalization` (boolean): Check if text requires normalization and perform normalization.
   *
   * Available on MongoDB version 3.4 and up.
   * The locale that gets passed is your current project's locale but defaults to "en".
   *
   * Example:
   * {
   *   strength: 3
   * }
   *
   * Defaults to disabled.
   */
  collation?: Omit<CollationOptions, 'locale'>
  /** Extra configuration options */
  connectOptions?: {
    /** Set false to disable $facet aggregation in non-supporting databases, Defaults to true */
    useFacet?: boolean
  } & ConnectOptions
  /** Set to true to disable hinting to MongoDB to use 'id' as index. This is currently done when counting documents for pagination. Disabling this optimization might fix some problems with AWS DocumentDB. Defaults to false */
  disableIndexHints?: boolean
  migrationDir?: string
  /**
   * typed as any to avoid dependency
   */
  mongoMemoryServer?: MongoMemoryReplSet
  transactionOptions?: TransactionOptions | false
  /** The URL to connect to MongoDB or false to start payload and prevent connecting */
  url: false | string
}

export type MongooseAdapter = {
  collections: {
    [slug: string]: CollectionModel
  }
  connection: Connection
  globals: GlobalModel
  mongoMemoryServer: MongoMemoryReplSet
  sessions: Record<number | string, ClientSession>
  versions: {
    [slug: string]: CollectionModel
  }
} & Args &
  BaseDatabaseAdapter

declare module 'payload' {
  export interface DatabaseAdapter
    extends Omit<BaseDatabaseAdapter, 'sessions'>,
      Omit<Args, 'migrationDir'> {
    collections: {
      [slug: string]: CollectionModel
    }
    connection: Connection
    globals: GlobalModel
    mongoMemoryServer: MongoMemoryReplSet
    sessions: Record<number | string, ClientSession>
    transactionOptions: TransactionOptions
    versions: {
      [slug: string]: CollectionModel
    }
  }
}

export function mongooseAdapter({
  autoPluralization = true,
  connectOptions,
  disableIndexHints = false,
  migrationDir: migrationDirArg,
  mongoMemoryServer,
  transactionOptions = {},
  url,
}: Args): DatabaseAdapterObj {
  function adapter({ payload }: { payload: Payload }) {
    const migrationDir = findMigrationDir(migrationDirArg)
    mongoose.set('strictQuery', false)

    return createDatabaseAdapter<MongooseAdapter>({
      name: 'mongoose',

      // Mongoose-specific
      autoPluralization,
      collections: {},
      connectOptions: connectOptions || {},
      connection: undefined,
      count,
      disableIndexHints,
      globals: undefined,
      mongoMemoryServer,
      sessions: {},
      transactionOptions: transactionOptions === false ? undefined : transactionOptions,
      url,
      versions: {},
      // DatabaseAdapter
      beginTransaction: transactionOptions ? beginTransaction : undefined,
      commitTransaction,
      connect,
      create,
      createGlobal,
      createGlobalVersion,
      createMigration,
      createVersion,
      defaultIDType: 'text',
      deleteMany,
      deleteOne,
      deleteVersions,
      destroy,
      find,
      findGlobal,
      findGlobalVersions,
      findOne,
      findVersions,
      init,
      migrateFresh,
      migrationDir,
      payload,
      queryDrafts,
      rollbackTransaction,
      updateGlobal,
      updateGlobalVersion,
      updateOne,
      updateVersion,
    })
  }

  return {
    defaultIDType: 'text',
    init: adapter,
  }
}

/**
 * Attempt to find migrations directory.
 *
 * Checks for the following directories in order:
 * - `migrationDir` argument from Payload config
 * - `src/migrations`
 * - `dist/migrations`
 * - `migrations`
 *
 * Defaults to `src/migrations`
 *
 * @param migrationDir
 * @returns
 */
function findMigrationDir(migrationDir?: string): string {
  const cwd = process.cwd()
  const srcDir = path.resolve(cwd, 'src/migrations')
  const distDir = path.resolve(cwd, 'dist/migrations')
  const relativeMigrations = path.resolve(cwd, 'migrations')

  // Use arg if provided
  if (migrationDir) return migrationDir

  // Check other common locations
  if (fs.existsSync(srcDir)) {
    return srcDir
  }

  if (fs.existsSync(distDir)) {
    return distDir
  }

  if (fs.existsSync(relativeMigrations)) {
    return relativeMigrations
  }

  return srcDir
}
