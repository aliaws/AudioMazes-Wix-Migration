import { Permissions, webMethod } from "wix-web-module";
import { listPublicPlans } from "wix-pricing-plans-backend";
import { members } from "wix-members.v2";
import { elevate } from "wix-auth";
import { orders } from "wix-pricing-plans.v2"; // admin list
import { contacts } from "wix-crm-backend";
import {  fetchAll }  from "backend/audio-books.web";

const listAdminOrders = elevate(orders.managementListOrders);


export const getPricingPlans = webMethod(
    Permissions.Anyone,
    async () => {
        const { plans } = await listPublicPlans();
        return indexBy(plans, "_id");
    }
);


export const getSoldSubscriptions = webMethod(Permissions.Anyone, async () => {
    try {
        const listedOrders = await getAllOrders();

        return listedOrders;
    } catch (error) {
        console.error(error);
        return error;
    }
});


export const getMmebers = webMethod(
    Permissions.Anyone,
    async () => {
        try {
            let allMembers = [];
            let offset = 0;
            const loop = true;
            const limit = 100;
            while (loop) {
                const params = {
                    paging: {
                        limit,
                        offset,
                    }
                };

                const data = await members.listMembers(params);
                allMembers.push(...data.members);
                if (data.metadata.count < limit) {
                    break;
                }
                offset += limit;
            }

            console.log("Fetched members:", allMembers.length);
            const allMembersMap =  indexBy(allMembers, "contactId");
            const membersReferenceMap = indexBy(await fetchAll("memberReferenceData"),"contactId");
            return mergeWithReferenceKey(allMembersMap, membersReferenceMap);
        } catch (err) {
            console.error("Error fetching members:", err);
            throw err;
        }
    }
);



export async function getAllOrders() {
    let allOrders = [];
    let offset = 0;
    const limit = 50;
    const loop = true;
    while (loop) {
        const { orders, pagingMetadata } = await listAdminOrders({
            limit,
            offset,
        });

        allOrders.push(...orders);

        if (!pagingMetadata.hasNext) {
            break;
        }

        offset = pagingMetadata.offset + pagingMetadata.count;
    }

    console.log("Fetched orders:", allOrders.length);
    return indexBy(allOrders, "subscriptionId");
}

const indexBy = (items, key) => {
    const result = {};
    for (const item of items) {
        result[item[key]] = item;
    }
    return result;
};




/* Sample options value:
 * {
 *   suppressAuth: true
 * }
 */

export const getAlContacts = webMethod(
    Permissions.Anyone,
    async () => {    
  try {
    const items = await fetchAll("memberReferenceData");

    return items;
  } catch (error) {
    console.error(error);
    // Handle the error
  }
});


function mergeWithReferenceKey(obj1, obj2, referenceKey = "members_reference") {
  const result = { ...obj1 };

  for (const key in obj2) {
    if (obj2.hasOwnProperty(key)) {
      if (result[key]) {
        // Add obj2's whole data inside the referenceKey property of matching keys
        result[key][referenceKey] = obj2[key];
      } else {
        // If no existing key, just assign obj2's data
        result[key] = obj2[key];
      }
    }
  }

  return result;
}