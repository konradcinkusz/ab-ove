using AbOvo.ServiceDefaults;
using Microsoft.EntityFrameworkCore;
using NetArchTest.Rules;

namespace AbOvo.Api.Tests;

/// <summary>
/// P2's ceiling is mechanical, not advisory, "because prose has already failed twice in this
/// estate". This is the half that catches the failure the size check only proxies for: a
/// kernel that has started to carry domain.
/// </summary>
public sealed class ArchitectureTests
{
    private static readonly System.Reflection.Assembly Kernel = typeof(IntegrationStatus).Assembly;

    [Fact]
    public void Kernel_references_no_type_from_the_service_or_its_contracts()
    {
        // The legacy monorepo's CORE began as shared plumbing and ended as a shared domain —
        // advert entities, points pricing, Polish category names. The dependency direction is
        // what stops that: the kernel must not know a service exists.
        var result = Types.InAssembly(Kernel)
            .ShouldNot()
            .HaveDependencyOnAny("AbOvo.Api", "AbOvo.Contracts")
            .GetResult();

        Assert.True(
            result.IsSuccessful,
            "The kernel references the service or its contracts: "
            + string.Join(", ", result.FailingTypeNames ?? []));
    }

    [Fact]
    public void Kernel_declares_no_entity_type()
    {
        // An entity in the kernel is the shape the rule exists to prevent. A DbContext
        // subclass or an [Owned]/[Table] type here means persistence has stopped being
        // plumbing and started being a model.
        var entities = Types.InAssembly(Kernel)
            .That().Inherit(typeof(DbContext))
            .GetTypes()
            .ToArray();

        Assert.True(
            entities.Length == 0,
            "The kernel declares a DbContext: " + string.Join(", ", entities.Select(t => t.FullName)));
    }

    [Fact]
    public void Kernel_exports_extension_methods_and_interfaces_rather_than_base_classes_to_inherit_from()
    {
        // P10 — "A .Core library in this estate exports interfaces and extension methods; it
        // does not export things you inherit from." MigrationHostedService<T> is the one
        // public non-sealed type, and it is a BackgroundService the kernel instantiates
        // itself rather than something a service derives from.
        var inheritable = Types.InAssembly(Kernel)
            .That().ArePublic().And().AreClasses().And().AreNotStatic().And().AreNotSealed()
            .GetTypes()
            .Where(t => !t.IsAbstract || t.IsAbstract)
            .Where(t => t.Name != "MigrationHostedService`1")
            .ToArray();

        Assert.True(
            inheritable.Length == 0,
            "The kernel exports a public unsealed class to inherit from: "
            + string.Join(", ", inheritable.Select(t => t.FullName)));
    }
}
