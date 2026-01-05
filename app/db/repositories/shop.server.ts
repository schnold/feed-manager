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
    features?: any;
  }): Promise<Shop> {
    return db.shop.create({
      data: {
        myshopifyDomain: data.myshopifyDomain,
        accessToken: data.accessToken,
        plan: data.plan || "free",  // Default to free for new shops
        features: data.features || {}
      }
    });
  }

  static async upsert(data: {
    myshopifyDomain: string;
    accessToken: string;
    plan?: string;
    features?: any;
  }): Promise<Shop> {
    return db.shop.upsert({
      where: { myshopifyDomain: data.myshopifyDomain },
      create: {
        myshopifyDomain: data.myshopifyDomain,
        accessToken: data.accessToken,
        plan: data.plan || "free",  // Default to free for new shops
        features: data.features || {}
      },
      update: {
        accessToken: data.accessToken,
        // CRITICAL: Only update plan and features if explicitly provided
        // This prevents overwriting subscription-based plans
        ...(data.plan !== undefined && { plan: data.plan }),
        ...(data.features !== undefined && { features: data.features })
      }
    });
  }

  static async updatePlan(myshopifyDomain: string, plan: string, features?: any): Promise<Shop> {
    const updateData: any = { plan };

    // Only update features if provided
    if (features !== undefined) {
      updateData.features = features;
    }

    console.log(`[ShopRepository] Updating plan for ${myshopifyDomain}:`, { plan, features });

    const updatedShop = await db.shop.update({
      where: { myshopifyDomain },
      data: updateData
    });

    console.log(`[ShopRepository] Plan updated successfully:`, {
      domain: updatedShop.myshopifyDomain,
      plan: updatedShop.plan,
      features: updatedShop.features
    });

    return updatedShop;
  }

  static async delete(myshopifyDomain: string): Promise<void> {
    await db.shop.delete({
      where: { myshopifyDomain }
    });
  }
}