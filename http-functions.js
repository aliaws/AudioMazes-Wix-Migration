

import { ok, badRequest, forbidden } from 'wix-http-functions';
import { secrets } from "wix-secrets-backend.v2";
import { elevate } from "wix-auth";
import {  getPricingPlans, getSoldSubscriptions, getMmebers, getAlContacts }  from "backend/subscriptions.web";
import {  fetchAll, buildIndexAndFacets }  from "backend/audio-books.web";


const elevatedGetSecretValue = elevate(secrets.getSecretValue);


export async function get_pricing_plans(request) {
    const response = { headers: { "Content-Type": "application/json" } };
    if(!await verify_api_key(request, response)) {
        return forbidden(response);
    }
    
    try {
        response.body = await getPricingPlans();
        return ok(response);

    } catch (err) {
        response.body = {
            "error": err
        }
        return badRequest(response);
    }
}

export async function get_sold_subscriptions(request) {
    const response = { headers: { "Content-Type": "application/json" } };
    if(!await verify_api_key(request, response)) {
        return forbidden(response);
    }
    
    try {
        response.body = await getSoldSubscriptions();
        return ok(response);

    } catch (err) {
        response.body = {
            "error": err
        }
        return badRequest(response);
    }
}

export async function get_all_members(request) {
    const response = { headers: { "Content-Type": "application/json" } };
    if(!await verify_api_key(request, response)) {
        return forbidden(response);
    }

    try {
        response.body = await getMmebers();
        return ok(response);

    } catch (err) {
        response.body = {
            "error": err
        }
        return badRequest(response);
    }
}



export async function get_audiobooks(request) {
    const response = { headers: { "Content-Type": "application/json" } };
    if(!await verify_api_key(request, response)) {
        return forbidden(response);
    }

    try {
        const items = await fetchAll("PremiumAudiobooks");
        const {contents: books, genres, map }  = await buildIndexAndFacets(items);
        response.body = { books, genres, map };

        return ok(response);

    } catch (err) {
        response.body = {
            "error": err
        }
        return badRequest(response);
    }
}


export async function get_chapters(request) {
    const response = { headers: { "Content-Type": "application/json" } };
    if(!await verify_api_key(request, response)) {
        return forbidden(response);
    }

    try {
        const items = await fetchAll("audiobookChapters");
        const { contents: chapters } = await buildIndexAndFacets(items, {
            idKey: "_id",
            uniques: {},
            media: { audioFile: "audioFileUrl" },
        });
        response.body = { chapters };
        
        return ok(response);

    } catch (err) {
        response.body = {
            "error": err
        }
        return badRequest(response);
    }
}

export async function get_all_contacts(request) {
    const response = { headers: { "Content-Type": "application/json" } };
    if(!await verify_api_key(request, response)) {
        return forbidden(response);
    }

    try {
        const contacts = await getAlContacts();
        response.body = { contacts };
        
        return ok(response);

    } catch (err) {
        response.body = {
            "error": err
        }
        return badRequest(response);
    }
}

export async function get_all_achievements(request) {
    const response = { headers: { "Content-Type": "application/json" } };
    if(!await verify_api_key(request, response)) {
        return forbidden(response);
    }

    try {
        const items = await fetchAll("achievements");
        const { contents: achievements } = await buildIndexAndFacets(items, {
            idKey: "_id",
            uniques: {},
            media: { achievementImage: "achievementImageUrl" },
        });
        response.body = { achievements };

        return ok(response);

    } catch (err) {
        response.body = {
            "error": err
        }
        return badRequest(response);
    }
}


async function verify_api_key(request, response) {
    const apiKey = request.headers["x-api-key"];
    const {value: secretKey} = await elevatedGetSecretValue("X_API_KEY");
    return apiKey == secretKey;
}