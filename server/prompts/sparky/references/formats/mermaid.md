# Mermaid Diagrams

## Intro

Render diagrams using a ` ```mermaid ` fenced code block with Mermaid syntax. The app renders the diagram automatically.

## When to Use

| User request | Diagram type | Mermaid header |
|-------------|-------------|----------------|
| Flowchart, process, workflow, decision tree | Flowchart | `flowchart TD` |
| API flow, message exchange, protocol | Sequence | `sequenceDiagram` |
| Object hierarchy, inheritance, OOP | Class | `classDiagram` |
| Database schema, entity relationships | ER | `erDiagram` |
| Project timeline, schedule, milestones | Gantt | `gantt` |
| Simple bar/line chart (small data) | XY Chart | `xychart-beta` |
| State machine, transitions | State | `stateDiagram-v2` |

## Examples

### Flowchart
```mermaid
flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Do something]
    B -->|No| D[Do other thing]
    C --> E[End]
    D --> E
```

### Sequence Diagram
```mermaid
sequenceDiagram
    participant A as Alice
    participant B as Bob
    A->>B: Hello Bob
    B-->>A: Hi Alice
    A->>B: How are you?
    B-->>A: Great!
```

### Class Diagram
```mermaid
classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }
    class Dog {
        +fetch()
    }
    Animal <|-- Dog
```

### ER Diagram
```mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    PRODUCT ||--o{ LINE_ITEM : "is in"
```

### XY Chart
```mermaid
xychart-beta
    title "Monthly Sales"
    x-axis ["Jan", "Feb", "Mar", "Apr", "May"]
    y-axis 0 --> 100
    bar [30, 45, 60, 50, 70]
    line [30, 45, 60, 50, 70]
```

### Gantt Chart
```mermaid
gantt
    title Project Plan
    dateFormat YYYY-MM-DD
    section Design
    Wireframes     :done, w1, 2026-01-01, 7d
    Mockups        :active, m1, after w1, 5d
    section Development
    Frontend       :f1, after m1, 14d
    Backend        :b1, after m1, 14d
    section Testing
    QA             :crit, qa1, after f1, 7d
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| `xychart` without `-beta` | Use `xychart-beta` — it's still in beta |
| XY chart colon-semicolon syntax: `line "name" : 1,2; 3,4` | Use bracket syntax: `line [1, 2, 3, 4]` |
| XY chart x-axis without brackets: `x-axis Jan, Feb` | Use brackets: `x-axis ["Jan", "Feb"]` |
| Gantt task missing commas between fields | Use: `Task :tags, id, start, duration` |
| Flowchart missing direction (`TD`, `LR`) | Always specify: `flowchart TD` or `flowchart LR` |
| Sequence diagram `->` instead of `->>` | Use `->>` for solid arrows, `-->>` for dashed |
