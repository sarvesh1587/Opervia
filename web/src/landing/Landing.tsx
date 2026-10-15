import Hero from './Hero'
import Nav from './Nav'
import { AnalyticsSection, AssistantSection, Closing, Footer, InventorySection, Principles, WorkflowSection } from './Sections'

export default function Landing() {
  return (
    <div className="bg-paper-50">
      <Nav />
      <main>
        <Hero />
        <Principles />
        <InventorySection />
        <WorkflowSection />
        <AnalyticsSection />
        <AssistantSection />
        <Closing />
      </main>
      <Footer />
    </div>
  )
}
