import VisitorCounter from "@/components/VisitorCounter";

const Index = () => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <VisitorCounter />
      <p className="mt-4 text-sm text-muted-foreground">
        Real-time global visitor counter powered by Lovable Cloud
      </p>
    </div>
  );
};

export default Index;
