import type { Feed, FeedMapping, FeedFilter, FeedSchedule } from "@prisma/client";
import db from "../../db.server";

export type FeedWithRelations = Feed & {
  mappings: FeedMapping[];
  filters: FeedFilter[];
  schedules: FeedSchedule[];
};

export class FeedRepository {
  static async findById(id: string): Promise<FeedWithRelations | null> {
    return db.feed.findUnique({
      where: { id },
      include: {
        shop: true,
        mappings: { orderBy: { order: "asc" } },
        filters: true,
        schedules: true
      }
    });
  }

  static async findByIdWithRelations(id: string): Promise<FeedWithRelations | null> {
    return db.feed.findUnique({
      where: { id },
      include: {
        mappings: { orderBy: { order: "asc" } },
        filters: true,
        schedules: true
      }
    });
  }

  static async findByShopId(shopId: string): Promise<Feed[]> {
    return db.feed.findMany({
      where: { shopId },
      orderBy: { updatedAt: "desc" }
    });
  }

  static async create(data: {
    shopId: string;
    name: string;
    title?: string;
    channel: string;
    type: string;
    language: string;
    country: string;
    currency: string;
    fileType: string;
    timezone: string;
    targetMarkets: string[];
    publicPath: string;
    publicUrl: string;
    token: string;
    settings?: any;
  }): Promise<Feed> {
    return db.feed.create({
      data: {
        ...data
      }
    });
  }

  static async update(id: string, data: Partial<Feed>): Promise<Feed> {
    return db.feed.update({
      where: { id },
      data
    });
  }

  static async updateFeed(id: string, data: {
    name?: string;
    title?: string;
    channel?: string;
    language?: string;
    country?: string;
    currency?: string;
    timezone?: string;
    locationId?: string | null;
    targetMarkets?: string[];
    settings?: any;
  }): Promise<Feed> {
    return db.feed.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date()
      }
    });
  }

  static async delete(id: string): Promise<void> {
    // Delete related data first
    await db.feedMapping.deleteMany({
      where: { feedId: id }
    });
    
    await db.feedFilter.deleteMany({
      where: { feedId: id }
    });
    
    await db.feedSchedule.deleteMany({
      where: { feedId: id }
    });
    
    await db.feedRun.deleteMany({
      where: { feedId: id }
    });
    
    await db.feedAsset.deleteMany({
      where: { feedId: id }
    });

    // Delete the feed
    await db.feed.delete({
      where: { id }
    });
  }

  static async deleteWithRelations(id: string): Promise<void> {
    // Use transaction to ensure all related data is deleted
    await db.$transaction(async (tx) => {
      // Delete all related records
      await tx.feedMapping.deleteMany({
        where: { feedId: id }
      });
      
      await tx.feedFilter.deleteMany({
        where: { feedId: id }
      });
      
      await tx.feedSchedule.deleteMany({
        where: { feedId: id }
      });
      
      await tx.feedRun.deleteMany({
        where: { feedId: id }
      });
      
      await tx.feedAsset.deleteMany({
        where: { feedId: id }
      });

      // Delete the feed
      await tx.feed.delete({
        where: { id }
      });
    });
  }

  static async updateStatus(
    id: string,
    status: string,
    lastRunAt?: Date,
    lastSuccessAt?: Date,
    lastError?: string
  ): Promise<Feed> {
    return db.feed.update({
      where: { id },
      data: {
        status,
        lastRunAt,
        lastSuccessAt,
        lastError
      }
    });
  }
}