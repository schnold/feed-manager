import type { Shop } from "@prisma/client";
import db from "../../db.server";

export class ShopRepository {
  static async findByDomain(myshopifyDomain: string): Promise<Shop | null> {
    return db.shop.findUnique({
      where: { myshopifyDomain }
    });
  }

  static async findAll(): Promise<Shop[]> {
    return db.shop.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }

  static async create(data: {
    myshopifyDomain: string;
    accessToken: string;
    plan?: string;
  }): Promise<Shop> {
    return db.shop.create({
      data: {
        myshopifyDomain: data.myshopifyDomain,
        accessToken: data.accessToken,
        plan: data.plan || "basic"
      }
    });
  }

  static async upsert(data: {
    myshopifyDomain: string;
    accessToken: string;
    plan?: string;
  }): Promise<Shop> {
    return db.shop.upsert({
      where: { myshopifyDomain: data.myshopifyDomain },
      create: {
        myshopifyDomain: data.myshopifyDomain,
        accessToken: data.accessToken,
        plan: data.plan || "basic"
      },
      update: {
        accessToken: data.accessToken,
        plan: data.plan || "basic"
      }
    });
  }

  static async delete(myshopifyDomain: string): Promise<void> {
    await db.shop.delete({
      where: { myshopifyDomain }
    });
  }
}