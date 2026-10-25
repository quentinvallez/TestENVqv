import { eq, schema } from "@viewing/db";
import { z } from "zod";
import { recordEvent } from "../events";
import { defineTool } from "../tool";

const { agencySettings } = schema;

export const getWidgetSettings = defineTool({
  name: "settings_get_widget",
  description: "What the website script shows on the agency's site besides the placeholders, such as the floating valuation button.",
  mutates: false,
  input: z.object({}),
  run: async (ctx) => {
    const [row] = await ctx.db.select({ widget: agencySettings.widget }).from(agencySettings).where(eq(agencySettings.agencyId, ctx.agencyId));
    return { valuationLauncher: row?.widget.valuationLauncher ?? true };
  },
});

export const updateWidgetSettings = defineTool({
  name: "settings_update_widget",
  description: "Turn the floating valuation button on the agency's website on or off.",
  mutates: true,
  input: z.object({ valuationLauncher: z.boolean() }),
  run: async (ctx, input) => {
    const [row] = await ctx.db.select({ widget: agencySettings.widget }).from(agencySettings).where(eq(agencySettings.agencyId, ctx.agencyId));
    const widget = { ...row?.widget, valuationLauncher: input.valuationLauncher };
    await ctx.db
      .insert(agencySettings)
      .values({ agencyId: ctx.agencyId, widget })
      .onConflictDoUpdate({ target: agencySettings.agencyId, set: { widget } });
    await recordEvent(ctx, { type: "settings.widget_updated", subjectType: "agency", subjectId: ctx.agencyId, data: widget });
    return widget;
  },
});
