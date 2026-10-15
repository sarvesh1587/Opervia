import AssistantPanel from '../AssistantPanel'

export default function AssistantPage() {
  return (
    <div className="mx-auto max-w-[1440px] md:px-7 md:py-8">
      <div className="h-[calc(100vh-150px)] min-h-[560px] overflow-hidden md:rounded-[16px]">
        <AssistantPanel variant="page" />
      </div>
    </div>
  )
}
