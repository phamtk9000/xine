import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";
import { OnboardingPicker } from "@/components/onboarding-picker";

export const metadata: Metadata = {
  title: "Tell xine what you like",
  description: "Five films you love, three you didn't connect with — enough for the recommender to start from something.",
};

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/watch/start");

  return (
    <>
      <PageHeader
        label="Getting started"
        title="Five films, and you're done."
        lede="This writes ordinary ratings — nothing special happens to them, and nothing here is required. It exists because a recommender with nothing to read from can only offer the editorial average, and that is the same page for everyone."
      />
      <Container className="py-14">
        <div className="max-w-3xl">
          <OnboardingPicker />
        </div>
      </Container>
    </>
  );
}
