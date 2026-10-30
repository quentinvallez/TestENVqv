import { describe, expect, it } from "vitest";
import { emptyListing } from "./extract";
import { listingFromPageData, pageDataUrl, withPageData } from "./page-data";

const page = "https://www.immodyck.be/nl/kopen/deurne/ruim-en-licht-appartement-met-2-grote-slaapkamers-en-terras/5626/";

describe("pages filled in by scripts (Gatsby)", () => {
  it("knows the data file of a Gatsby page", () => {
    expect(pageDataUrl(`<meta name="generator" content="trung 3.14.1"/><div id="___gatsby"></div>`, page)).toBe(
      "https://www.immodyck.be/page-data/nl/kopen/deurne/ruim-en-licht-appartement-met-2-grote-slaapkamers-en-terras/5626/page-data.json",
    );
    expect(pageDataUrl("<html><body><h1>Woning</h1></body></html>", page)).toBeNull();
  });

  it("reads the listing of the page from its data file, not the others shown next to it (Omnicasa)", () => {
    const other = { ID: 5617, Street: "Andere straat", Zip: "2100", City: "DEURNE", Price: 199000, ManagerName: "Iemand Anders", Goal: 0 };
    const own = {
      ID: 5626, Goal: 0, Street: "Nieuwe Donk", HouseNumber: "27", Zip: "2100", City: "DEURNE", PublishPrice: true, Price: 254000,
      NumberOfBedRooms: 2, NumberOfBathRooms: 1, SurfaceTotal: 100, SurfaceGround2: 0, ManagerName: "Johan Dyck",
      ManagerDirectPhone: "03/3663060", ManagerMobilePhone: "", ManagerEmail: "johan@immodyck.be", LargePictures: ["https://cdn.omnicasapictures.com/5626AL.jpg"],
    };
    const json = JSON.stringify({ path: "/nl/kopen/…", result: { pageContext: { layout: {}, data: { contentRow: [{ config: { priceField: { valueField: "Price" } }, data: { similar: [other], property: own } }] } } } });
    const data = listingFromPageData(json, page)!;
    expect(data).toMatchObject({
      reference: "5626", transaction: "sale", street: "Nieuwe Donk", houseNumber: "27", postcode: "2100", city: "Deurne", price: 254000,
      bedrooms: 2, livingArea: 100, plotArea: null, agentName: "Johan Dyck", agentEmail: "johan@immodyck.be", agentPhone: "+3233663060",
    });
    const merged = withPageData({ ...emptyListing(), title: "Ruim en licht appartement", bedrooms: 2 }, data);
    expect(merged).toMatchObject({ title: "Ruim en licht appartement", price: 254000, city: "Deurne", photos: ["https://cdn.omnicasapictures.com/5626AL.jpg"] });
    expect(listingFromPageData("not json", page)).toBeNull();
  });

  it("takes sale or rent and the site's label from the data file over the page's menu words", () => {
    const rentalPage = "https://www.immodyck.be/nl/huren/merksem/appartement/5623/";
    const property = (sub: string) => JSON.stringify({ result: { pageContext: { data: { property: { ID: 5623, Goal: 1, Street: "Eendstraat", Zip: "2170", City: "MERKSEM", Price: 850, SubStatusName: sub } } } } });
    const optie = listingFromPageData(property("Optie"), rentalPage)!;
    expect(optie).toMatchObject({ transaction: "rent", status: "under_offer", price: 850 });
    expect(listingFromPageData(property("Nieuw"), rentalPage)!.status).toBeNull();
    const pageReading = { ...emptyListing(), transaction: "sale" as const, status: "active" as const, price: 850 };
    expect(withPageData(pageReading, optie)).toMatchObject({ transaction: "rent", status: "under_offer" });
  });
});
