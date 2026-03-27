import { useState } from "react";
import { GroupDiscussion } from "@/components/GroupDiscussion";
import { EvaluationReport, GDEvaluation } from "@/components/EvaluationReport";
import { GDTopicSelector } from "@/components/GDTopicSelector";

type AppState = 
  | { screen: "gd-topic-select" }
  | { screen: "gd-active"; topic: string }
  | { screen: "gd-result"; evaluation: GDEvaluation };

const Index = () => {
  const [appState, setAppState] = useState<AppState>({ screen: "gd-topic-select" });

  const handleStartGD = (topic: string) => {
    setAppState({ screen: "gd-active", topic });
  };

  const handleEndGD = (evaluation: GDEvaluation) => {
    setAppState({ screen: "gd-result", evaluation });
  };

  const handleBackToTopics = () => {
    setAppState({ screen: "gd-topic-select" });
  };

  // Render based on current state
  switch (appState.screen) {
    case "gd-topic-select":
      return (
        <GDTopicSelector
          onSelectTopic={handleStartGD}
          onCancel={handleBackToTopics}
        />
      );

    case "gd-active":
      return (
        <GroupDiscussion
          topic={appState.topic}
          onEndDiscussion={handleEndGD}
          onCancel={handleBackToTopics}
        />
      );

    case "gd-result":
      return (
        <EvaluationReport
          evaluation={appState.evaluation}
          onRestart={handleBackToTopics}
          onBackToModules={handleBackToTopics}
        />
      );

    default:
      return <GDTopicSelector onSelectTopic={handleStartGD} onCancel={handleBackToTopics} />;
  }
};

export default Index;
