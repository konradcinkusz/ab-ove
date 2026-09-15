using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AbOvo.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddFrameOutcomes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FrameOutcomes",
                columns: table => new
                {
                    BundleTag = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Track = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Unit = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Step = table.Column<int>(type: "integer", nullable: false),
                    Check = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Attempt = table.Column<int>(type: "integer", nullable: false),
                    Passed = table.Column<bool>(type: "boolean", nullable: false),
                    Count = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FrameOutcomes", x => new { x.BundleTag, x.Track, x.Unit, x.Step, x.Check, x.Attempt, x.Passed });
                });

            migrationBuilder.CreateIndex(
                name: "IX_FrameOutcomes_BundleTag_Track_Unit_Step",
                table: "FrameOutcomes",
                columns: new[] { "BundleTag", "Track", "Unit", "Step" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FrameOutcomes");
        }
    }
}
